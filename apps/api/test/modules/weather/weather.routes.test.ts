// GET /v1/weather: Observation de clima pelo mesmo adaptador/cache do briefing. Fetch sempre falso.
import { readFileSync } from 'node:fs';
import fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { ObservationSchema, ProblemDetailsSchema } from '@kairos/contracts';
import { LruCache } from '../../../src/infrastructure/cache/lru-cache.js';
import { createHttpClient, type FetchFn } from '../../../src/infrastructure/http-client.js';
import { ProviderRunner } from '../../../src/infrastructure/provider-runner.js';
import { OpenMeteoAdapter } from '../../../src/providers/weather/open-meteo.adapter.js';
import { weatherRoutes } from '../../../src/modules/weather/weather.routes.js';
import { FakeClock, jsonResponse } from '../../infrastructure/helpers.js';

// Mesmo fixture real do adaptador (current.time 2026-10-12T15:45, com vento, código do tempo e daily)
const FIXTURE = JSON.parse(
  readFileSync(new URL('../../providers/weather/fixtures/forecast-2026-10-12.json', import.meta.url), 'utf8'),
) as unknown;

/** App só com o plugin de clima; fetch falso contando as chamadas que chegaram à "fonte". */
function montarApp(resposta: () => Response) {
  const chamadas: string[] = [];
  const fetch: FetchFn = async (input) => {
    chamadas.push(String(input));
    return resposta();
  };
  // 15:50 em São Paulo: 5 min depois do current.time do fixture → fresh
  const clock = new FakeClock(Date.parse('2026-10-12T18:50:00Z'));
  const runner = new ProviderRunner({ cache: new LruCache({ clock }), clock });
  const app = fastify();
  app.register(weatherRoutes, { runner, weather: new OpenMeteoAdapter(createHttpClient({ fetch }), clock) });
  return { app, chamadas };
}

describe('GET /v1/weather', () => {
  it('200 com a Observation de clima (fresh, com ventoKmH, código do tempo, hoje e sol), válida no ObservationSchema', async () => {
    const { app } = montarApp(() => jsonResponse(FIXTURE));
    const res = await app.inject({ method: 'GET', url: '/v1/weather?lat=-23.5505&lon=-46.6333' });

    expect(res.statusCode).toBe(200);
    const obs = ObservationSchema.parse(res.json());
    expect(obs).toMatchObject({ dimension: 'weather', source: 'open-meteo', status: 'fresh' });
    if (obs.dimension !== 'weather' || !obs.value) throw new Error('observation de clima sem valor');
    expect(obs.value.atual).toMatchObject({ ventoKmH: 4, codigoTempo: 81, sensacaoC: 22.6, umidadePct: 87, uv: 3.2 });
    expect(obs.value.hoje).toEqual({ temperaturaMaxC: 24.9, temperaturaMinC: 17.2 });
    expect(obs.value.sol).toEqual({ nascer: '2026-10-12T05:36:00-03:00', por: '2026-10-12T18:09:00-03:00' });
  });

  it('reaproveita o cache do runner na 2ª chamada (ponto vizinho: cacheKey com 2 casas)', async () => {
    const { app, chamadas } = montarApp(() => jsonResponse(FIXTURE));
    await app.inject({ method: 'GET', url: '/v1/weather?lat=-23.5505&lon=-46.6333' });
    const res = await app.inject({ method: 'GET', url: '/v1/weather?lat=-23.5512&lon=-46.6349' });

    expect(res.statusCode).toBe(200);
    expect(chamadas).toHaveLength(1);
  });

  it.each([
    ['sem lat e lon', '/v1/weather', ['lat', 'lon']],
    ['lat fora da faixa', '/v1/weather?lat=91&lon=-46.6', ['lat']],
    ['lon fora da faixa', '/v1/weather?lat=-23.55&lon=181', ['lon']],
    ['lat não numérica', '/v1/weather?lat=abc&lon=-46.6', ['lat']],
  ])('400 problem+json VALIDATION_ERROR (%s)', async (_nome, url, paths) => {
    const { app, chamadas } = montarApp(() => jsonResponse(FIXTURE));
    const res = await app.inject({ method: 'GET', url });

    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    const problem = ProblemDetailsSchema.parse(res.json());
    expect(problem.code).toBe('VALIDATION_ERROR');
    expect(problem.errors?.map((e) => e.path)).toEqual(expect.arrayContaining(paths));
    expect(chamadas).toHaveLength(0);
  });

  it('fonte fora do ar (HTTP 503) → 200 com Observation unavailable e motivo, nunca 500', async () => {
    const { app } = montarApp(() => jsonResponse('Service Unavailable', 503));
    const res = await app.inject({ method: 'GET', url: '/v1/weather?lat=-23.5505&lon=-46.6333' });

    expect(res.statusCode).toBe(200);
    const obs = ObservationSchema.parse(res.json());
    expect(obs).toMatchObject({ dimension: 'weather', status: 'unavailable', value: null });
    expect(obs.motivo).toBeTruthy();
  });
});
