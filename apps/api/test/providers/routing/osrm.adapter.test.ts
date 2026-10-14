import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LruCache } from '../../../src/infrastructure/cache/lru-cache.js';
import { SchemaValidationError } from '../../../src/infrastructure/errors.js';
import { createHttpClient, KAIROS_USER_AGENT, type FetchFn } from '../../../src/infrastructure/http-client.js';
import { ProviderRunner } from '../../../src/infrastructure/provider-runner.js';
import { MinIntervalLimiter, RATE_LIMITS } from '../../../src/infrastructure/rate-limiter.js';
import {
  OSRM_SOURCE,
  OSRM_TTL_SECONDS,
  OsrmAdapter,
  OsrmRouteResponseSchema,
  mapearRotaOsrm,
} from '../../../src/providers/routing/osrm.adapter.js';
import { FakeClock, jsonResponse, memoryLogger } from '../../infrastructure/helpers.js';

// Resposta real do spike T08 (10/10/2026): MASP → Praça da Sé
const FIXTURE = JSON.parse(
  readFileSync(new URL('../../../../../spikes/osrm-nominatim/fixture-route.json', import.meta.url), 'utf8'),
);
const MASP = { lat: -23.5614961, lon: -46.6559677 };
const SE = { lat: -23.5503898, lon: -46.633081 };

/** fetch falso que registra URL, cabeçalhos e o instante (relógio simulado) de cada chamada. */
function fakeFetch(clock: FakeClock, responder: () => Response) {
  const chamadas: { url: string; headers: Record<string, string>; em: number }[] = [];
  const fetch: FetchFn = async (input, init) => {
    chamadas.push({ url: String(input), headers: (init?.headers ?? {}) as Record<string, string>, em: clock.now() });
    return responder();
  };
  return { fetch, chamadas };
}

function setup(responder: () => Response = () => jsonResponse(FIXTURE.resposta)) {
  const clock = new FakeClock();
  const { fetch, chamadas } = fakeFetch(clock, responder);
  const osrm = new OsrmAdapter({ http: createHttpClient({ fetch }) });
  const limiter = new MinIntervalLimiter({
    intervalMs: RATE_LIMITS.umPorSegundoMs,
    clock,
    sleep: async (ms) => clock.advance(ms),
  });
  const runner = new ProviderRunner({ cache: new LruCache({ clock }), clock, rateLimiters: { [OSRM_SOURCE]: limiter } });
  return { clock, osrm, runner, chamadas, logger: memoryLogger() };
}

describe('OsrmAdapter (T20, RF24)', () => {
  it('monta a URL do spike com coordenadas [lon,lat] arredondadas e chave por par origem/destino', () => {
    const osrm = new OsrmAdapter();
    expect(osrm.url({ origem: MASP, destino: SE })).toBe(
      'https://router.project-osrm.org/route/v1/driving/-46.65597,-23.56150;-46.63308,-23.55039?overview=full&geometries=geojson',
    );
    expect(osrm.cacheKey({ origem: MASP, destino: SE })).toBe('driving:-46.65597,-23.56150;-46.63308,-23.55039');
    // Diferença abaixo de 5 casas → mesma chave; sentido inverso → outra chave
    const quase = { origem: { lat: -23.561496, lon: -46.655968 }, destino: SE };
    expect(osrm.cacheKey(quase)).toBe(osrm.cacheKey({ origem: MASP, destino: SE }));
    expect(osrm.cacheKey({ origem: SE, destino: MASP })).not.toBe(osrm.cacheKey({ origem: MASP, destino: SE }));
    expect(osrm.ttlSeconds).toBe(OSRM_TTL_SECONDS);
    expect(OSRM_TTL_SECONDS).toBe(604_800);
    expect(osrm.timeoutMs).toBe(3_000);
  });

  it('mapeia o fixture real: 189 pontos [lon,lat], 4 949,8 m e 575,3 s', () => {
    const rota = mapearRotaOsrm(OsrmRouteResponseSchema.parse(FIXTURE.resposta));
    expect(rota.coordenadas).toHaveLength(189);
    expect(rota.coordenadas[0]).toEqual([-46.655871, -23.561539]);
    expect(rota.distanciaM).toBe(4949.8);
    expect(rota.duracaoS).toBe(575.3);
  });

  it('envia o User-Agent próprio e devolve a rota', async () => {
    const { osrm, chamadas } = setup();
    const { value } = await osrm.fetch({ origem: MASP, destino: SE }, { signal: new AbortController().signal });
    expect(value.coordenadas).toHaveLength(189);
    expect(chamadas[0]!.headers['User-Agent']).toBe(KAIROS_USER_AGENT);
  });

  it('code diferente de "Ok" ou sem rotas → SchemaValidationError', async () => {
    const { osrm } = setup(() => jsonResponse({ code: 'NoRoute', routes: [] }));
    await expect(osrm.fetch({ origem: MASP, destino: SE }, { signal: new AbortController().signal })).rejects.toBeInstanceOf(
      SchemaValidationError,
    );
  });

  it('cache: o 2º pedido do mesmo par (dias depois, dentro de 7 dias) não chama o OSRM', async () => {
    const { clock, osrm, runner, chamadas, logger } = setup();
    const primeira = await runner.execute(osrm, { origem: MASP, destino: SE }, { logger });
    clock.advance(6 * 24 * 3_600_000);
    const segunda = await runner.execute(osrm, { origem: MASP, destino: SE }, { logger });
    expect(chamadas).toHaveLength(1);
    expect([primeira.cache, segunda.cache]).toEqual(['miss', 'hit']);
    expect(segunda.status).toBe('fresh');
  });

  it('fila serial: pedidos seguidos de pares diferentes saem com ≥ 1,1 s de intervalo', async () => {
    const { osrm, runner, chamadas, logger } = setup();
    await runner.execute(osrm, { origem: MASP, destino: SE }, { logger });
    await runner.execute(osrm, { origem: SE, destino: MASP }, { logger });
    await runner.execute(osrm, { origem: MASP, destino: MASP }, { logger });
    expect(chamadas).toHaveLength(3);
    const intervalos = chamadas.slice(1).map((c, i) => c.em - chamadas[i]!.em);
    expect(intervalos.every((ms) => ms >= 1_100)).toBe(true);
  });
});
