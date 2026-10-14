// GET /v1/rota (RF24, contrato 1.5.0): TomTom a pé/carro, carro cai para o OSRM, nunca linha reta. Sem rede.
import { readFileSync } from 'node:fs';
import fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { ProblemDetailsSchema, RotaResponseSchema } from '@kairos/contracts';
import { LruCache } from '../../../src/infrastructure/cache/lru-cache.js';
import { createHttpClient, type FetchFn } from '../../../src/infrastructure/http-client.js';
import { ProviderRunner } from '../../../src/infrastructure/provider-runner.js';
import { rotaRoutes } from '../../../src/modules/rota/rota.routes.js';
import { TOMTOM_SOURCE, createTomTomRotas } from '../../../src/providers/routing/tomtom.adapter.js';
import { FakeClock, jsonResponse } from '../../infrastructure/helpers.js';
import { osrmFalso } from '../briefing/helpers.js';

const fixture = (nome: string) =>
  readFileSync(new URL(`../../providers/routing/fixtures/${nome}.json`, import.meta.url), 'utf8');
const CARRO = fixture('tomtom-rota-carro-2026-10-13');
const A_PE = fixture('tomtom-rota-a-pe-2026-10-13');
const CHAVE = 'chave-rota-teste';
const URL_OK = '/v1/rota?de=-23.5614961,-46.6559677&para=-23.5503898,-46.633081';

function montar(o: { tomtom?: 'ok' | 'falha' | null; osrmFalha?: boolean } = {}) {
  const clock = new FakeClock(Date.parse('2026-10-13T22:38:37-03:00'));
  let chamadas = 0;
  const fetch: FetchFn = async (u) => {
    chamadas++;
    if (o.tomtom === 'falha') return jsonResponse('down', 503);
    return new Response(String(u).includes('pedestrian') ? A_PE : CARRO, { status: 200 });
  };
  const rotas = o.tomtom === null ? null : createTomTomRotas({ chave: CHAVE, http: createHttpClient({ fetch }), clock });
  const runner = new ProviderRunner({
    cache: new LruCache({ clock }),
    clock,
    rateLimiters: rotas ? { [TOMTOM_SOURCE]: rotas.limiter } : {},
  });
  const app = fastify();
  app.register(rotaRoutes, { runner, tomtom: rotas, osrm: osrmFalso(o.osrmFalha ?? true) });
  return { app, clock, chamadas: () => chamadas };
}

describe('GET /v1/rota', () => {
  it('a pé pela TomTom: distância e tempo reais, sem atraso de trânsito', async () => {
    const { app } = montar();
    const res = await app.inject({ method: 'GET', url: `${URL_OK}&modo=a-pe` });
    expect(res.statusCode).toBe(200);
    const body = RotaResponseSchema.parse(res.json());
    expect(body).toMatchObject({ modo: 'a-pe', fonte: 'tomtom', distanciaM: 3150, duracaoS: 2268, atrasoTransitoS: null });
    expect(body.coordenadas).toHaveLength(127);
    expect(res.body).not.toContain(CHAVE);
  });

  it('carro (padrão) pela TomTom: atraso de trânsito preenchido', async () => {
    const { app } = montar();
    const body = RotaResponseSchema.parse((await app.inject({ method: 'GET', url: URL_OK })).json());
    expect(body).toMatchObject({ modo: 'carro', fonte: 'tomtom', distanciaM: 4073, duracaoS: 597, atrasoTransitoS: 0 });
  });

  it('carro com a TomTom fora → OSRM', async () => {
    const { app } = montar({ tomtom: 'falha', osrmFalha: false });
    const body = RotaResponseSchema.parse((await app.inject({ method: 'GET', url: `${URL_OK}&modo=carro` })).json());
    expect(body).toMatchObject({ fonte: 'osrm', distanciaM: 3000, duracaoS: 600, atrasoTransitoS: null });
  });

  it('sem TOMTOM_KEY: carro pelo OSRM; a pé → 503 problem+json (OSRM público não tem perfil a pé)', async () => {
    const { app } = montar({ tomtom: null, osrmFalha: false });
    expect((await app.inject({ method: 'GET', url: URL_OK })).json().fonte).toBe('osrm');
    const res = await app.inject({ method: 'GET', url: `${URL_OK}&modo=a-pe` });
    expect(res.statusCode).toBe(503);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(ProblemDetailsSchema.parse(res.json())).toMatchObject({ code: 'PROVIDER_UNAVAILABLE', detail: expect.stringMatching(/a pé só pela TomTom/) });
  });

  it('TomTom e OSRM fora → 503 com os motivos; NUNCA linha reta', async () => {
    const { app } = montar({ tomtom: 'falha', osrmFalha: true });
    const res = await app.inject({ method: 'GET', url: URL_OK });
    expect(res.statusCode).toBe(503);
    expect(res.json().detail).toMatch(/TomTom: TomTom fora do ar \(HTTP 503\); OSRM: Falha de conexão/);
    expect(res.body).not.toContain('linha-reta');
    expect(res.body).not.toContain(CHAVE);
  });

  it('cache: a mesma rota a pé não chama a TomTom de novo no mesmo dia', async () => {
    const { app, clock, chamadas } = montar();
    await app.inject({ method: 'GET', url: `${URL_OK}&modo=a-pe` });
    clock.advance(23 * 3_600_000);
    await app.inject({ method: 'GET', url: `${URL_OK}&modo=a-pe` });
    expect(chamadas()).toBe(1);
  });

  it.each([
    ['sem parâmetros', '/v1/rota', ['de', 'para']],
    ['formato errado', '/v1/rota?de=abc&para=-23.5,-46.6', ['de']],
    ['latitude fora do intervalo', '/v1/rota?de=-123.5,-46.6&para=-23.5,-46.6', ['de.lat']],
    ['modo desconhecido', `${URL_OK}&modo=bicicleta`, ['modo']],
  ])('400 problem+json: %s', async (_nome, url, caminhos) => {
    const { app, chamadas } = montar();
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(ProblemDetailsSchema.parse(res.json()).errors?.map((e) => e.path)).toEqual(caminhos);
    expect(chamadas()).toBe(0);
  });
});
