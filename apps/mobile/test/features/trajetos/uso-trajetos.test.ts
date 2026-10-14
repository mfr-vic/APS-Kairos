// Registro local de uso (hierarquia dos trajetos): só instantes por id, com intervalo mínimo,
// teto, retenção e limpeza de trajetos excluídos; histórico corrompido não derruba nada.
import {
  CHAVE_USO_TRAJETOS,
  comUso,
  criarUsoStore,
  INTERVALO_MINIMO_MS,
  MAX_USOS_POR_TRAJETO,
  RETENCAO_MS,
} from '@/features/trajetos/uso-trajetos';

function memoria() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: async (k: string) => m.get(k) ?? null,
    setItem: async (k: string, v: string) => void m.set(k, v),
  };
}

const T0 = Date.parse('2026-10-13T07:30:00-03:00');
const MIN = 60_000;

describe('comUso (pura)', () => {
  it('acrescenta o uso sem mudar o registro recebido', () => {
    const antes = { a: [T0 - 60 * MIN] };
    const depois = comUso(antes, 'a', T0);
    expect(depois.a).toEqual([T0 - 60 * MIN, T0]);
    expect(antes.a).toHaveLength(1);
  });

  it('reabrir em menos de 30 min conta uma vez só', () => {
    let u = comUso({}, 'a', T0);
    u = comUso(u, 'a', T0 + INTERVALO_MINIMO_MS - 1);
    expect(u.a).toEqual([T0]);
    u = comUso(u, 'a', T0 + INTERVALO_MINIMO_MS);
    expect(u.a).toEqual([T0, T0 + INTERVALO_MINIMO_MS]);
  });

  it(`guarda no máximo ${MAX_USOS_POR_TRAJETO} usos por trajeto (os mais novos)`, () => {
    let u = {};
    for (let i = 0; i < MAX_USOS_POR_TRAJETO + 5; i++) u = comUso(u, 'a', T0 + i * 60 * MIN);
    const a = (u as Record<string, number[]>).a;
    expect(a).toHaveLength(MAX_USOS_POR_TRAJETO);
    expect(a[a.length - 1]).toBe(T0 + (MAX_USOS_POR_TRAJETO + 4) * 60 * MIN);
  });

  it('apaga usos além da retenção e trajetos que não existem mais', () => {
    const velho = T0 - RETENCAO_MS - 1;
    const u = comUso({ a: [velho, T0 - 60 * MIN], b: [velho], excluido: [T0 - 60 * MIN] }, 'a', T0, ['a', 'b']);
    expect(u).toEqual({ a: [T0 - 60 * MIN, T0] });
  });
});

describe('criarUsoStore', () => {
  it('registra e relê do armazenamento (só ids e instantes)', async () => {
    const arm = memoria();
    let agora = T0;
    const s = criarUsoStore(arm, () => new Date(agora));
    await s.registrar('a');
    agora += 60 * MIN;
    await s.registrar('b', ['a', 'b']);
    expect(await criarUsoStore(arm).ler()).toEqual({ a: [T0], b: [T0 + 60 * MIN] });
    expect(JSON.parse(arm.m.get(CHAVE_USO_TRAJETOS)!)).toEqual({ a: [T0], b: [T0 + 60 * MIN] });
  });

  it('histórico corrompido ou fora do formato vira vazio (a ordem só volta ao padrão)', async () => {
    const arm = memoria();
    arm.m.set(CHAVE_USO_TRAJETOS, '{nao é json');
    expect(await criarUsoStore(arm).ler()).toEqual({});
    arm.m.set(CHAVE_USO_TRAJETOS, JSON.stringify({ a: ['ontem'] }));
    expect(await criarUsoStore(arm).ler()).toEqual({});
    arm.m.set(CHAVE_USO_TRAJETOS, JSON.stringify([1, 2]));
    expect(await criarUsoStore(arm).ler()).toEqual({});
  });

  it('limpar apaga todo o histórico', async () => {
    const arm = memoria();
    const s = criarUsoStore(arm, () => new Date(T0));
    await s.registrar('a');
    await s.limpar();
    expect(await s.ler()).toEqual({});
  });
});
