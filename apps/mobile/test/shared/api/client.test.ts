// T29: requisições do app às rotas de cadastro (URL, método, corpo) e validação pelo contrato.
import exemplo from '../../../../../packages/contracts/examples/briefing-request.json';

import { API_URL_PADRAO, apiUrl, definirApiUrl } from '@/config/api';
import { api } from '@/shared/api/client';
import { ApiError } from '@/shared/api/errors';
import { lerRegistro, limparRegistro } from '@/shared/api/registro';

const fetchMock = jest.fn();
globalThis.fetch = fetchMock;

function responde(corpo: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
  );
}

const url = () => fetchMock.mock.calls[0][0] as string;

describe('api (T29)', () => {
  beforeEach(() => fetchMock.mockReset());

  it('geocode codifica o termo', async () => {
    responde({ resultados: [{ lat: -23.56, lon: -46.65, rotulo: 'Av. Paulista, 1000' }] });
    const r = await api.geocode('Av. Paulista, 1000');
    expect(url()).toMatch(/\/v1\/geocode\?q=Av\.%20Paulista%2C%201000$/);
    expect(r.resultados).toHaveLength(1);
  });

  it('linhas e paradas de ônibus', async () => {
    responde({ linhas: [] });
    await api.linhasOnibus('875A');
    expect(url()).toMatch(/\/v1\/transit\/bus\/lines\?q=875A$/);
    fetchMock.mockReset();
    responde({ paradas: [] });
    await api.paradasOnibus(609);
    expect(url()).toMatch(/\/v1\/transit\/bus\/stops\?lineCode=609$/);
  });

  it('linhas de trilho fora do contrato → erro de contrato', async () => {
    responde({ linhas: [{ linha: 'L99', nome: 'x', operadora: 'y' }] });
    await expect(api.linhasTrilho()).rejects.toMatchObject({ tipo: 'contrato' });
  });

  it('briefing: POST com o BriefingRequest no corpo', async () => {
    responde({ type: 'about:blank', title: 'Entrada inválida', status: 400 }, 400);
    const erro = await api.briefing(exemplo as never).catch((e: unknown) => e);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(exemplo);
    expect(erro).toBeInstanceOf(ApiError);
    expect((erro as ApiError).message).toBe('Entrada inválida');
  });

  it('sem rede → ApiError "rede"', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(api.geocode('Av. Paulista')).rejects.toMatchObject({ tipo: 'rede' });
  });
});

describe('requisitar alimenta o registro de requisições (item 7)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    limparRegistro();
  });

  it('sucesso: rota sem a query (sem endereço), status, bytes e latência', async () => {
    responde({ resultados: [] });
    await api.geocode('Rua Augusta, 100');
    const [e] = lerRegistro();
    expect(e).toMatchObject({ metodo: 'GET', rota: '/v1/geocode', status: 200, erro: null, degradadas: null });
    expect(e.bytes).toBe(JSON.stringify({ resultados: [] }).length);
    expect(e.latenciaMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(e)).not.toMatch(/Augusta/);
  });

  it('erro HTTP, rede e contrato ficam registrados com o tipo', async () => {
    responde({ type: 'about:blank', title: 'Entrada inválida', status: 400 }, 400);
    await api.briefing(exemplo as never).catch(() => {});
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    await api.health().catch(() => {});
    responde({ linhas: [{ linha: 'L99' }] });
    await api.linhasTrilho().catch(() => {});
    expect(lerRegistro().map((e) => [e.metodo, e.rota, e.status, e.erro])).toEqual([
      ['GET', '/v1/transit/rail/lines', 200, 'contrato'],
      ['GET', '/v1/health', null, 'rede'],
      ['POST', '/v1/briefings', 400, 'http'],
    ]);
  });

  it('briefing com dimensões degradadas fica marcado mesmo se o resto do corpo for inválido', async () => {
    responde({
      observacoes: [
        { dimension: 'bus', status: 'unavailable' },
        { dimension: 'weather', status: 'stale' },
      ],
    });
    await api.briefing(exemplo as never).catch(() => {});
    expect(lerRegistro()[0].degradadas).toEqual({ stale: ['weather'], unavailable: ['bus'] });
  });
});

describe('servidor da API configurável', () => {
  beforeEach(() => fetchMock.mockReset());
  afterEach(() => definirApiUrl(null));

  it('as chamadas usam o endereço efetivo (personalizado)', async () => {
    definirApiUrl('http://10.0.0.5:3000');
    responde({ status: 'up', timestamp: '2026-10-14T12:00:00Z' });
    await api.health();
    expect(url()).toBe('http://10.0.0.5:3000/v1/health');
  });

  it('healthEm testa outro servidor sem trocar o efetivo', async () => {
    responde({ status: 'up', timestamp: '2026-10-14T12:00:00Z' });
    await api.healthEm('http://10.0.0.9:3000');
    expect(url()).toBe('http://10.0.0.9:3000/v1/health');
    expect(apiUrl()).toBe(API_URL_PADRAO);
  });
});
