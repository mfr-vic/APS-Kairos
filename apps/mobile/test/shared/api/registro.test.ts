// Registro de requisições (item 7): anel de 50, sem query, resumo por rota, limpar/desfazer.
import {
  CAPACIDADE_REGISTRO,
  dimensoesDegradadas,
  lerRegistro,
  limparRegistro,
  registrar,
  restaurarRegistro,
  resumirRegistro,
  rotaSemQuery,
  type EntradaRegistro,
} from '@/shared/api/registro';

const base: Omit<EntradaRegistro, 'id'> = {
  em: 0,
  metodo: 'GET',
  rota: '/v1/health',
  status: 200,
  erro: null,
  latenciaMs: 100,
  bytes: 10,
  degradadas: null,
};

describe('registro de requisições', () => {
  beforeEach(() => limparRegistro());

  it('guarda no máximo 50, mais recente primeiro', () => {
    for (let i = 0; i < CAPACIDADE_REGISTRO + 5; i++) registrar({ ...base, latenciaMs: i });
    const r = lerRegistro();
    expect(r).toHaveLength(CAPACIDADE_REGISTRO);
    expect(r[0].latenciaMs).toBe(CAPACIDADE_REGISTRO + 4);
  });

  it('rotaSemQuery tira endereço e coordenadas', () => {
    expect(rotaSemQuery('/v1/geocode?q=Av.%20Paulista')).toBe('/v1/geocode');
    expect(rotaSemQuery('/v1/weather?lat=-23.5&lon=-46.6')).toBe('/v1/weather');
    expect(rotaSemQuery('/v1/health')).toBe('/v1/health');
  });

  it('dimensoesDegradadas lê stale/unavailable de observacoes; null sem observacoes', () => {
    expect(
      dimensoesDegradadas({
        observacoes: [
          { dimension: 'weather', status: 'fresh' },
          { dimension: 'bus', status: 'unavailable' },
          { dimension: 'air', status: 'stale' },
        ],
      })
    ).toEqual({ stale: ['air'], unavailable: ['bus'] });
    expect(dimensoesDegradadas({ status: 'up' })).toBeNull();
    expect(dimensoesDegradadas(null)).toBeNull();
  });

  it('resumo: taxa de sucesso e média por rota, sem contar canceladas', () => {
    registrar({ ...base, rota: '/v1/briefings', latenciaMs: 1000 });
    registrar({ ...base, rota: '/v1/briefings', latenciaMs: 2000, erro: 'tempo-esgotado', status: null });
    registrar({ ...base, latenciaMs: 50 });
    registrar({ ...base, latenciaMs: 9999, erro: 'cancelada', status: null });
    const r = resumirRegistro(lerRegistro());
    expect(r).toMatchObject({ total: 3, sucesso: 2, taxaSucesso: 67 });
    expect(r.porRota).toEqual([
      { rota: '/v1/briefings', total: 2, sucesso: 1, latenciaMediaMs: 1500 },
      { rota: '/v1/health', total: 1, sucesso: 1, latenciaMediaMs: 50 },
    ]);
    expect(resumirRegistro([]).taxaSucesso).toBeNull();
  });

  it('limpar devolve o que havia e restaurar desfaz sem perder as novas', () => {
    registrar({ ...base, latenciaMs: 1 });
    const antigas = limparRegistro();
    expect(lerRegistro()).toHaveLength(0);
    registrar({ ...base, latenciaMs: 2 });
    restaurarRegistro(antigas);
    expect(lerRegistro().map((e) => e.latenciaMs)).toEqual([2, 1]);
  });
});
