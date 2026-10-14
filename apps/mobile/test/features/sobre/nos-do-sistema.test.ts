import { estadoDoNo, NOS_DO_SISTEMA } from '@/features/sobre/nos-do-sistema';

const p = (name: string, status: 'ok' | 'degradado' | 'indisponivel' | 'desconhecido', latencyMs: number | null) => ({
  name,
  status,
  latencyMs,
  lastSuccessAt: null,
  requestCount: 0,
  successCount: 0,
  avgLatencyMs: null,
});

describe('nós do sistema', () => {
  it('8 nós cobrindo os 9 nomes do /v1/health/providers (FONTES_SAUDE da API, com a TomTom)', () => {
    expect(NOS_DO_SISTEMA).toHaveLength(8);
    expect(NOS_DO_SISTEMA.find((n) => n.id === 'transito')).toMatchObject({ nome: 'TomTom', fontes: ['tomtom'] });
    expect(NOS_DO_SISTEMA.flatMap((n) => n.fontes).sort()).toEqual(
      ['artesp', 'geosampa', 'metro-sp', 'nominatim', 'open-meteo', 'open-meteo-air-quality', 'osrm', 'sptrans-olhovivo', 'tomtom'].sort()
    );
  });

  it('estado do nó = pior estado das fontes; latência = a maior medida', () => {
    const rotas = NOS_DO_SISTEMA.find((n) => n.id === 'rotas')!;
    expect(estadoDoNo(rotas, [p('osrm', 'ok', 120), p('nominatim', 'degradado', 900), p('open-meteo', 'indisponivel', 5)])).toEqual({
      status: 'degradado',
      latencyMs: 900,
    });
  });

  it('regressão 13/10: fonte não consultada não rebaixa o nó se a outra já respondeu', () => {
    const rotas = NOS_DO_SISTEMA.find((n) => n.id === 'rotas')!;
    expect(estadoDoNo(rotas, [p('osrm', 'ok', 1694), p('nominatim', 'desconhecido', null)])).toEqual({
      status: 'ok',
      latencyMs: 1694,
    });
  });

  it('sem dados do servidor → desconhecido, sem latência', () => {
    expect(estadoDoNo(NOS_DO_SISTEMA[0], undefined)).toEqual({ status: 'desconhecido', latencyMs: null });
    expect(estadoDoNo(NOS_DO_SISTEMA[0], [p('open-meteo', 'desconhecido', null)])).toEqual({
      status: 'desconhecido',
      latencyMs: null,
    });
  });
});
