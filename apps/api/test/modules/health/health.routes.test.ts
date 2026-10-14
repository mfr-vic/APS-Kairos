import fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { HealthSchema, ProvidersHealthResponseSchema } from '@kairos/contracts';
import { LruCache } from '../../../src/infrastructure/cache/lru-cache.js';
import { HttpStatusError } from '../../../src/infrastructure/errors.js';
import { ProviderRunner } from '../../../src/infrastructure/provider-runner.js';
import type { Provider } from '../../../src/infrastructure/provider.js';
import { FONTES_SAUDE, healthRoutes, statusDaFonte } from '../../../src/modules/health/health.routes.js';
import { FakeClock, memoryLogger } from '../../infrastructure/helpers.js';

const clock = new FakeClock();
let app: ReturnType<typeof fastify> | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** Provedor falso: a "latência" é o quanto ele avança o relógio falso. */
function fonte(source: string, latenciaMs: number, falhar = false): Provider<string, string> {
  return {
    source,
    ttlSeconds: 1,
    cacheKey: (i) => i,
    fetch: async () => {
      clock.advance(latenciaMs);
      if (falhar) throw new HttpStatusError(503, source, '');
      return { value: 'ok' };
    },
  };
}

async function consultar(runner: ProviderRunner) {
  app = fastify();
  await app.register(healthRoutes, { runner });
  const res = await app.inject({ method: 'GET', url: '/v1/health/providers' });
  return ProvidersHealthResponseSchema.parse(res.json()).providers;
}

describe('health routes (T28, RF18)', () => {
  it('GET /v1/health segue o contrato', async () => {
    app = fastify();
    await app.register(healthRoutes, { runner: new ProviderRunner({ cache: new LruCache() }) });
    const res = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(HealthSchema.parse(res.json()).status).toBe('up');
  });

  const NUNCA_CHAMADA = {
    status: 'desconhecido',
    latencyMs: null,
    lastSuccessAt: null,
    requestCount: 0,
    successCount: 0,
    avgLatencyMs: null,
  };

  it('sem chamadas: todas as fontes desconhecido, sem latência e contadores zerados (nada inventado)', async () => {
    const providers = await consultar(new ProviderRunner({ cache: new LruCache({ clock }), clock }));
    expect(providers.map((p) => p.name)).toEqual([...FONTES_SAUDE]);
    for (const p of providers) {
      expect(p).toEqual({ name: p.name, ...NUNCA_CHAMADA });
    }
  });

  it('usa o que o runner mediu: ok com latência e contadores, degradado após falha, indisponível com breaker aberto', async () => {
    const runner = new ProviderRunner({ cache: new LruCache({ clock }), clock });
    const opts = { logger: memoryLogger() };
    await runner.execute(fonte('open-meteo', 120), 'a', opts);
    await runner.execute(fonte('open-meteo', 999), 'a', opts); // cache hit: não conta
    await runner.execute(fonte('open-meteo', 80), 'b', opts);
    await runner.execute(fonte('osrm', 50), 'a', opts);
    await runner.execute(fonte('osrm', 10, true), 'b', opts);
    for (const k of ['a', 'b', 'c']) await runner.execute(fonte('nominatim', 5, true), k, opts);
    await runner.execute(fonte('simulado:open-meteo', 1), 'a', opts);

    const porNome = Object.fromEntries((await consultar(runner)).map((p) => [p.name, p]));
    expect(porNome['open-meteo']).toMatchObject({
      status: 'ok',
      latencyMs: 80,
      requestCount: 2,
      successCount: 2,
      avgLatencyMs: 100,
    });
    expect(porNome['open-meteo']!.lastSuccessAt).not.toBeNull();
    expect(porNome.osrm).toMatchObject({ status: 'degradado', latencyMs: 50, requestCount: 2, successCount: 1, avgLatencyMs: 50 });
    expect(porNome.nominatim).toMatchObject({
      status: 'indisponivel',
      latencyMs: null,
      lastSuccessAt: null,
      requestCount: 3,
      successCount: 0,
      avgLatencyMs: null,
    });
    expect(porNome.artesp).toEqual({ name: 'artesp', ...NUNCA_CHAMADA });
    // simulados não entram na saúde das fontes reais
    expect(porNome['simulado:open-meteo']).toBeUndefined();
  });

  it('statusDaFonte', () => {
    expect(statusDaFonte(undefined)).toBe('desconhecido');
    const base = {
      source: 'x',
      breaker: 'closed' as const,
      lastSuccessAt: null,
      lastLatencyMs: null,
      lastError: null,
      requestCount: 0,
      successCount: 0,
      avgLatencyMs: null,
    };
    expect(statusDaFonte(base)).toBe('desconhecido');
    expect(statusDaFonte({ ...base, breaker: 'half-open', lastError: 'timeout' })).toBe('degradado');
  });
});
