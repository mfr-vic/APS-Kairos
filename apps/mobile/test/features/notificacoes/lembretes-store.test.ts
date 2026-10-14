// RF25: preferências dos lembretes no aparelho (validação, padrão e interruptor geral).
import { CHAVE_LEMBRETES, criarLembretesStore, LEMBRETES_PADRAO } from '@/features/notificacoes/lembretes-store';

function memoria(inicial: Record<string, string> = {}) {
  const dados = { ...inicial };
  return {
    dados,
    getItem: async (k: string) => dados[k] ?? null,
    setItem: async (k: string, v: string) => {
      dados[k] = v;
    },
  };
}

const L = { hora: 7, minuto: 40, origem: 'habitual' as const, habitual: { hora: 7, minuto: 50 } };

describe('lembretesStore', () => {
  it('sem nada salvo ou com JSON inválido → padrão (geral ligado, nenhum lembrete)', async () => {
    expect(await criarLembretesStore(memoria()).ler()).toEqual(LEMBRETES_PADRAO);
    expect(await criarLembretesStore(memoria({ [CHAVE_LEMBRETES]: '{x' })).ler()).toEqual(LEMBRETES_PADRAO);
    expect(
      await criarLembretesStore(memoria({ [CHAVE_LEMBRETES]: JSON.stringify({ ativo: 1 }) })).ler()
    ).toEqual(LEMBRETES_PADRAO);
  });

  it('definir/ajustar não religa o geral; só ligarGeral liga; remover apaga só o trajeto', async () => {
    const s = criarLembretesStore(memoria());
    await s.definirGeral(false);
    expect((await s.definir('a', L)).ativo).toBe(false);
    expect((await s.definir('b', L, true)).ativo).toBe(true);
    const r = await s.remover('a');
    expect(Object.keys(r.porTrajeto)).toEqual(['b']);
    expect(await s.ler()).toEqual(r);
  });
});
