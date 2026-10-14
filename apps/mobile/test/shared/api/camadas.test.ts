// GET /v1/mapa/camadas pelo cliente do app: URL e validação pelo contrato 1.4.0.
import { buscarCamadas } from '@/shared/api/camadas';
import { ApiError } from '@/shared/api/errors';

import { CAMADAS_EXEMPLO } from '../../support/camadas';

const fetchMock = jest.fn();
globalThis.fetch = fetchMock;

function responde(corpo: unknown) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(corpo), { status: 200, headers: { 'Content-Type': 'application/json' } })
  );
}

describe('buscarCamadas', () => {
  beforeEach(() => fetchMock.mockReset());

  it('chama /v1/mapa/camadas e devolve a resposta validada', async () => {
    responde(CAMADAS_EXEMPLO);
    const r = await buscarCamadas();
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/v1\/mapa\/camadas$/);
    expect(r.clima.pontos).toHaveLength(2);
  });

  it('fora do contrato → ApiError "contrato"', async () => {
    responde({ ...CAMADAS_EXEMPLO, limiares: null });
    responde({ ...CAMADAS_EXEMPLO, limiares: null });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(buscarCamadas()).rejects.toEqual(expect.objectContaining({ tipo: 'contrato' }));
    await expect(buscarCamadas().catch((e) => e)).resolves.toBeInstanceOf(ApiError);
    warn.mockRestore();
  });
});
