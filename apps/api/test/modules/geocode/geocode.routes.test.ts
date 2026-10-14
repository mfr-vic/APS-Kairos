import { readFileSync } from 'node:fs';
import fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { GeocodeResponseSchema, ProblemDetailsSchema } from '@kairos/contracts';
import { LruCache } from '../../../src/infrastructure/cache/lru-cache.js';
import { createHttpClient, type FetchFn } from '../../../src/infrastructure/http-client.js';
import { ProviderRunner } from '../../../src/infrastructure/provider-runner.js';
import { geocodeRoutes } from '../../../src/modules/geocode/geocode.routes.js';
import { NominatimAdapter } from '../../../src/providers/geocode/nominatim.adapter.js';
import { hangingFetch, jsonResponse } from '../../infrastructure/helpers.js';

const FIXTURE = JSON.parse(
  readFileSync(new URL('../../../../../spikes/osrm-nominatim/fixture-geocode.json', import.meta.url), 'utf8'),
);
const PAULISTA = FIXTURE.respostas['Avenida Paulista, 1578, São Paulo'];

const apps: ReturnType<typeof fastify>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

async function montar(fetch: FetchFn, timeoutMs?: number) {
  let chamadas = 0;
  const contando: FetchFn = (input, init) => {
    chamadas++;
    return fetch(input, init);
  };
  const app = fastify();
  apps.push(app);
  await app.register(geocodeRoutes, {
    runner: new ProviderRunner({ cache: new LruCache() }),
    nominatim: new NominatimAdapter({ http: createHttpClient({ fetch: contando }), timeoutMs }),
  });
  await app.ready();
  return { app, chamadas: () => chamadas };
}

describe('GET /v1/geocode (T20, RF01, TC02)', () => {
  it('devolve os resultados no GeocodeResponseSchema e usa o cache na repetição', async () => {
    const { app, chamadas } = await montar(async () => jsonResponse(PAULISTA));
    const url = `/v1/geocode?q=${encodeURIComponent('Avenida Paulista, 1578, São Paulo')}`;
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(200);
    const body = GeocodeResponseSchema.parse(res.json());
    expect(body.resultados[0]).toMatchObject({ lat: -23.5614961, lon: -46.6559677 });
    expect(body.resultados[0]!.rotulo).toContain('Avenida Paulista');

    const repetida = await app.inject({ method: 'GET', url });
    expect(repetida.json()).toEqual(body);
    expect(chamadas()).toBe(1);
  });

  it.each([
    ['sem q', '/v1/geocode'],
    ['q curto', '/v1/geocode?q=ab'],
    ['q só com espaços', '/v1/geocode?q=%20%20%20%20'],
    ['q longo demais', `/v1/geocode?q=${'a'.repeat(201)}`],
  ])('%s → 400 problem+json sem chamar a fonte', async (_caso, url) => {
    const { app, chamadas } = await montar(async () => jsonResponse(PAULISTA));
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    const problem = ProblemDetailsSchema.parse(res.json());
    expect(problem).toMatchObject({ status: 400, title: 'Entrada inválida', code: 'VALIDATION_ERROR' });
    expect(problem.errors?.[0]?.path).toBe('q');
    expect(chamadas()).toBe(0);
  });

  it('Nominatim fora do ar → 503 problem+json em pt-BR', async () => {
    const { app } = await montar(async () => jsonResponse('Service Unavailable', 503));
    const res = await app.inject({ method: 'GET', url: '/v1/geocode?q=Pra%C3%A7a%20da%20S%C3%A9' });
    expect(res.statusCode).toBe(503);
    expect(res.headers['content-type']).toContain('application/problem+json');
    const problem = ProblemDetailsSchema.parse(res.json());
    expect(problem).toMatchObject({ status: 503, code: 'PROVIDER_UNAVAILABLE', instance: '/v1/geocode?q=Pra%C3%A7a%20da%20S%C3%A9' });
    expect(problem.detail).toContain('HTTP 503');
  });

  it('Nominatim lento (estoura o timeout) → 503', async () => {
    const { app } = await montar(hangingFetch(), 30);
    const res = await app.inject({ method: 'GET', url: '/v1/geocode?q=Avenida%20Paulista' });
    expect(res.statusCode).toBe(503);
    expect(ProblemDetailsSchema.parse(res.json()).detail).toContain('não respondeu a tempo');
  });

  it('nenhum resultado → 200 com lista vazia', async () => {
    const { app } = await montar(async () => jsonResponse([]));
    const res = await app.inject({ method: 'GET', url: '/v1/geocode?q=xyzxyz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ resultados: [] });
  });
});
