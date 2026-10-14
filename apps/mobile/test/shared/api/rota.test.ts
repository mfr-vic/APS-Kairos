// GET /v1/rota (contrato 1.5.0): URL, validação do contrato e 503 sem rota (erro, nunca fallback).
import { ApiError } from '@/shared/api/errors';
import { buscarRota, chaveRota } from '@/shared/api/rota';

const ROTA = {
  modo: 'a-pe',
  fonte: 'tomtom',
  distanciaM: 1200,
  duracaoS: 900,
  atrasoTransitoS: null,
  coordenadas: [
    [-46.6433, -23.5505],
    [-46.6333, -23.5505],
  ],
  observedAt: '2026-10-14T08:00:00-03:00',
};

const SE = { lat: -23.5505, lon: -46.6333 };
const AQUI = { lat: -23.550512345, lon: -46.64331 };

afterEach(() => jest.restoreAllMocks());

describe('buscarRota', () => {
  it('chama /v1/rota com de, para (5 casas) e modo; valida no contrato', async () => {
    const f = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(ROTA), { status: 200 }));
    await expect(buscarRota(AQUI, SE, 'a-pe')).resolves.toMatchObject({ distanciaM: 1200, fonte: 'tomtom' });
    expect(String(f.mock.calls[0][0])).toMatch(/\/v1\/rota\?de=-23\.55051,-46\.64331&para=-23\.55050,-46\.63330&modo=a-pe$/);
  });

  it('503 problem+json = ApiError (o app mostra "Rota indisponível", sem linha reta)', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ type: 'about:blank', title: 'Sem rota', status: 503 }), {
        status: 503,
        headers: { 'Content-Type': 'application/problem+json' },
      })
    );
    await expect(buscarRota(AQUI, SE, 'carro')).rejects.toBeInstanceOf(ApiError);
  });

  it('resposta fora do contrato vira erro de contrato', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ...ROTA, fonte: 'linha-reta' }), { status: 200 }));
    await expect(buscarRota(AQUI, SE, 'a-pe')).rejects.toMatchObject({ tipo: 'contrato' });
  });

  it('chave de cache estável para variações abaixo de ~1 m', () => {
    expect(chaveRota(AQUI, SE, 'a-pe')).toEqual(chaveRota({ lat: -23.5505123, lon: -46.643312 }, SE, 'a-pe'));
  });
});
