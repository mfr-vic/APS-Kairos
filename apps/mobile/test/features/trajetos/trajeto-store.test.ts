// T13 / RF04 / TC05: CRUD de trajetos com armazenamento em memória no lugar do AsyncStorage.
import {
  CHAVE_TRAJETOS,
  criarTrajetoStore,
  migrarTrajeto,
  trajetoPrincipal,
} from '@/features/trajetos/trajeto-store';

function memoria() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: async (k: string) => m.get(k) ?? null,
    setItem: async (k: string, v: string) => void m.set(k, v),
  };
}

const dados = (nome: string) => ({
  nome,
  trajeto: {
    origem: { lat: -23.56, lon: -46.65, rotulo: 'A' },
    destino: { lat: -23.55, lon: -46.63, rotulo: 'B' },
    trilhos: ['L4' as const],
  },
});

describe('TC05 (lógica): CRUD de trajetos', () => {
  it('2 salvos → reabrir → editar 1 → excluir 1 → lista = 1 trajeto editado', async () => {
    const arm = memoria();
    const s1 = criarTrajetoStore(arm);
    const a = await s1.criar(dados('Casa → Faculdade'));
    const b = await s1.criar(dados('Casa → Trabalho'));

    // nova instância com o mesmo armazenamento = fechar e reabrir o app
    const s2 = criarTrajetoStore(arm);
    expect((await s2.listar()).map((t) => t.nome)).toEqual(['Casa → Faculdade', 'Casa → Trabalho']);
    await s2.atualizar(a.id, dados('Casa → Faculdade (editado)'));
    await s2.excluir(b.id);

    const final = await criarTrajetoStore(arm).listar();
    expect(final).toHaveLength(1);
    expect(final[0].nome).toBe('Casa → Faculdade (editado)');
    expect(final[0].trajeto.onibus).toEqual([]); // default do contrato
  });

  it('descarta itens fora do schema e JSON corrompido', async () => {
    const arm = memoria();
    arm.m.set(CHAVE_TRAJETOS, JSON.stringify([{ id: 'x' }]));
    expect(await criarTrajetoStore(arm).listar()).toEqual([]);
    arm.m.set(CHAVE_TRAJETOS, '{nao é json');
    expect(await criarTrajetoStore(arm).listar()).toEqual([]);
  });

  it('T29: trajeto salvo antes do BusPicker (sem "onibus") continua válido e aceita ônibus', async () => {
    const arm = memoria();
    const antigo = {
      id: 'antigo',
      nome: 'Antigo',
      trajeto: {
        origem: { lat: -23.56, lon: -46.65, rotulo: 'A' },
        destino: { lat: -23.55, lon: -46.63, rotulo: 'B' },
        trilhos: ['L1'],
      },
      criadoEm: '2026-10-09T10:00:00.000Z',
      atualizadoEm: '2026-10-09T10:00:00.000Z',
    };
    arm.m.set(CHAVE_TRAJETOS, JSON.stringify([antigo]));
    const s = criarTrajetoStore(arm);
    const [lido] = await s.listar();
    expect(lido.trajeto.onibus).toEqual([]);
    const onibus = [{ codigoLinha: 609, letreiro: '875A-10', codigoParada: 260016861 }];
    await s.atualizar('antigo', { nome: 'Antigo', trajeto: { ...lido.trajeto, onibus } });
    expect((await criarTrajetoStore(arm).obter('antigo'))?.trajeto.onibus).toEqual(onibus);
  });

  it('ARTESP (13/10): trajeto salvo com L4 e L5 continua igual e aceita L8 (sem migração)', async () => {
    const arm = memoria();
    const salvo = {
      id: 'l4l5',
      nome: 'Pinheiros → Santo Amaro',
      trajeto: {
        origem: { lat: -23.56, lon: -46.65, rotulo: 'A' },
        destino: { lat: -23.55, lon: -46.63, rotulo: 'B' },
        trilhos: ['L4', 'L5'],
        onibus: [],
      },
      criadoEm: '2026-10-10T10:00:00.000Z',
      atualizadoEm: '2026-10-10T10:00:00.000Z',
    };
    arm.m.set(CHAVE_TRAJETOS, JSON.stringify([salvo]));
    const s = criarTrajetoStore(arm);
    const [lido] = await s.listar();
    expect(lido).toEqual({ ...salvo, favorito: false }); // só ganha o campo novo (migração 14/10)
    await s.atualizar('l4l5', { nome: lido.nome, trajeto: { ...lido.trajeto, trilhos: ['L4', 'L5', 'L8'] } });
    expect((await criarTrajetoStore(arm).obter('l4l5'))?.trajeto.trilhos).toEqual(['L4', 'L5', 'L8']);
  });

  it('trajeto principal: sem marcação é o primeiro; definirPrincipal marca só um e preserva atualizadoEm', async () => {
    const arm = memoria();
    const s = criarTrajetoStore(arm);
    const a = await s.criar(dados('A'));
    const b = await s.criar(dados('B'));
    expect(trajetoPrincipal(await s.listar())?.id).toBe(a.id);

    await s.definirPrincipal(b.id);
    const lista = await criarTrajetoStore(arm).listar(); // "reabrir o app"
    expect(lista.map((t) => t.principal)).toEqual([false, true]);
    expect(trajetoPrincipal(lista)?.id).toBe(b.id);
    expect(lista[1].atualizadoEm).toBe(b.atualizadoEm);

    await s.definirPrincipal(a.id);
    expect((await s.listar()).map((t) => t.principal)).toEqual([true, false]);
    await expect(s.definirPrincipal('nao-existe')).rejects.toThrow(/não encontrado/);
    expect(trajetoPrincipal([])).toBeUndefined();
  });

  it('editar um trajeto mantém a marcação de principal', async () => {
    const s = criarTrajetoStore(memoria());
    await s.criar(dados('A'));
    const b = await s.criar(dados('B'));
    await s.definirPrincipal(b.id);
    await s.atualizar(b.id, dados('B editado'));
    expect(trajetoPrincipal(await s.listar())?.nome).toBe('B editado');
  });

  it('Desfazer da exclusão: devolve o trajeto idêntico na MESMA posição', async () => {
    const arm = memoria();
    const s = criarTrajetoStore(arm);
    const a = await s.criar(dados('A'));
    const b = await s.criar(dados('B'));
    const c = await s.criar(dados('C'));
    await s.definirPrincipal(b.id);
    const snap = await s.excluir(b.id);
    expect(snap?.indice).toBe(1);
    expect((await s.listar()).map((t) => t.nome)).toEqual(['A', 'C']);
    await s.restaurar(snap!.trajeto, snap!.indice);
    const lista = await criarTrajetoStore(arm).listar();
    expect(lista.map((t) => t.id)).toEqual([a.id, b.id, c.id]);
    expect(lista[1]).toEqual({ ...b, principal: true }); // mesmo id, datas e marcação
    expect(await s.excluir('nao-existe')).toBeNull();
  });

  it('restaurar um ex-principal depois que outro virou principal: a escolha nova vence', async () => {
    const s = criarTrajetoStore(memoria());
    const a = await s.criar(dados('A'));
    const b = await s.criar(dados('B'));
    await s.definirPrincipal(a.id);
    const snap = await s.excluir(a.id);
    await s.definirPrincipal(b.id);
    await s.restaurar(snap!.trajeto, snap!.indice);
    expect(trajetoPrincipal(await s.listar())?.id).toBe(b.id);
  });

  it('definirPrincipal devolve o anterior (para o Desfazer) e null desmarca todos', async () => {
    const s = criarTrajetoStore(memoria());
    const a = await s.criar(dados('A'));
    const b = await s.criar(dados('B'));
    expect(await s.definirPrincipal(b.id)).toEqual({ anterior: null });
    expect(await s.definirPrincipal(a.id)).toEqual({ anterior: b.id });
    await s.definirPrincipal(null);
    expect((await s.listar()).every((t) => !t.principal)).toBe(true);
  });

  it('migração de kairos:trajetos:v1: a antiga estrela (principal) vira favorito, sem perder nada', async () => {
    const arm = memoria();
    const base = {
      trajeto: {
        origem: { lat: -23.56, lon: -46.65, rotulo: 'A' },
        destino: { lat: -23.55, lon: -46.63, rotulo: 'B' },
        trilhos: ['L4'],
        onibus: [{ codigoLinha: 609, letreiro: '875A-10', codigoParada: 260016861 }],
      },
      criadoEm: '2026-10-10T10:00:00.000Z',
      atualizadoEm: '2026-10-11T10:00:00.000Z',
    };
    const antigos = [
      { id: 'a', nome: 'Casa → Trabalho', principal: false, ...base },
      { id: 'b', nome: 'Trabalho → Casa', principal: true, ...base },
      { id: 'c', nome: 'Sem campo', ...base },
    ];
    arm.m.set(CHAVE_TRAJETOS, JSON.stringify(antigos));
    const s = criarTrajetoStore(arm);
    const lidos = await s.listar();
    expect(lidos).toEqual([
      { ...antigos[0], favorito: false },
      { ...antigos[1], favorito: true }, // continua principal E ganha a estrela
      { ...antigos[2], favorito: false },
    ]);
    // Gravar algo persiste o campo; reler não muda nada (idempotente).
    await s.definirFavorito('c', true);
    const relidos = await criarTrajetoStore(arm).listar();
    expect(relidos.map((t) => [t.id, t.favorito, t.principal])).toEqual([
      ['a', false, false],
      ['b', true, true],
      ['c', true, undefined],
    ]);
    expect(JSON.parse(arm.m.get(CHAVE_TRAJETOS)!).every((t: { favorito?: boolean }) => typeof t.favorito === 'boolean')).toBe(true);
    expect(relidos[0].atualizadoEm).toBe(base.atualizadoEm);
  });

  it('migrarTrajeto não mexe em quem já tem o campo; trajeto novo nasce sem estrela', async () => {
    const s = criarTrajetoStore(memoria());
    const novo = await s.criar(dados('Novo'));
    expect(novo.favorito).toBe(false);
    // Virar principal depois NÃO vira favorito (a migração só vale para dados sem o campo).
    await s.definirPrincipal(novo.id);
    const [lido] = await s.listar();
    expect(lido).toMatchObject({ principal: true, favorito: false });
    expect(migrarTrajeto({ ...lido, favorito: false })).toEqual({ ...lido, favorito: false });
  });

  it('definirFavorito: vários favoritos, devolve o anterior e preserva atualizadoEm', async () => {
    const s = criarTrajetoStore(memoria());
    const a = await s.criar(dados('A'));
    const b = await s.criar(dados('B'));
    expect(await s.definirFavorito(a.id, true)).toEqual({ anterior: false });
    expect(await s.definirFavorito(b.id, true)).toEqual({ anterior: false });
    expect((await s.listar()).map((t) => t.favorito)).toEqual([true, true]);
    expect(await s.definirFavorito(a.id, false)).toEqual({ anterior: true });
    const lista = await s.listar();
    expect(lista.map((t) => t.favorito)).toEqual([false, true]);
    expect(lista[0].atualizadoEm).toBe(a.atualizadoEm);
    await expect(s.definirFavorito('nao-existe', true)).rejects.toThrow(/não encontrado/);
  });

  it('editar um trajeto favorito mantém a estrela', async () => {
    const s = criarTrajetoStore(memoria());
    const a = await s.criar(dados('A'));
    await s.definirFavorito(a.id, true);
    await s.atualizar(a.id, dados('A editado'));
    expect(await s.obter(a.id)).toMatchObject({ nome: 'A editado', favorito: true });
  });

  it('recusa linhas de ônibus em pontos diferentes', async () => {
    const d = {
      ...dados('X'),
      trajeto: {
        ...dados('X').trajeto,
        onibus: [
          { codigoLinha: 1, letreiro: 'A', codigoParada: 10 },
          { codigoLinha: 2, letreiro: 'B', codigoParada: 20 },
        ],
      },
    };
    await expect(criarTrajetoStore(memoria()).criar(d)).rejects.toThrow(/mesmo ponto/);
  });

  it('recusa trajeto inválido (lat fora do intervalo)', async () => {
    const s = criarTrajetoStore(memoria());
    const d = dados('X');
    d.trajeto.origem.lat = 200;
    await expect(s.criar(d)).rejects.toThrow(/inválido/);
  });
});
