import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GeometrySchema, ObservationSchema } from '@kairos/contracts';
import type { CachePort } from '../../../src/infrastructure/cache/cache.port.js';
import { LruCache } from '../../../src/infrastructure/cache/lru-cache.js';
import { createHttpClient, type FetchFn } from '../../../src/infrastructure/http-client.js';
import { ProviderRunner } from '../../../src/infrastructure/provider-runner.js';
import { MinIntervalLimiter, RATE_LIMITS } from '../../../src/infrastructure/rate-limiter.js';
import {
  MOTIVO_SEM_TOMTOM,
  RouteGeometryService,
  linhaReta,
  valorTransito,
} from '../../../src/modules/routing/route-geometry.service.js';
import { OSRM_SOURCE, OsrmAdapter } from '../../../src/providers/routing/osrm.adapter.js';
import { TOMTOM_SOURCE, createTomTomRotas } from '../../../src/providers/routing/tomtom.adapter.js';
import { FakeClock, hangingFetch, jsonResponse, memoryLogger } from '../../infrastructure/helpers.js';

const FIXTURE = JSON.parse(
  readFileSync(new URL('../../../../../spikes/osrm-nominatim/fixture-route.json', import.meta.url), 'utf8'),
);
const MASP = { lat: -23.5614961, lon: -46.6559677 };
const SE = { lat: -23.5503898, lon: -46.633081 };
const LINHA_RETA = [
  [-46.6559677, -23.5614961],
  [-46.633081, -23.5503898],
];

function setup(fetch: FetchFn, opts: { timeoutMs?: number; cache?: CachePort } = {}) {
  const clock = new FakeClock();
  let chamadas = 0;
  const contando: FetchFn = (input, init) => {
    chamadas++;
    return fetch(input, init);
  };
  const osrm = new OsrmAdapter({ http: createHttpClient({ fetch: contando }), timeoutMs: opts.timeoutMs });
  const runner = new ProviderRunner({
    cache: opts.cache ?? new LruCache({ clock }),
    clock,
    rateLimiters: {
      [OSRM_SOURCE]: new MinIntervalLimiter({ intervalMs: RATE_LIMITS.umPorSegundoMs, clock, sleep: async (ms) => clock.advance(ms) }),
    },
  });
  return { clock, runner, service: new RouteGeometryService(runner, osrm), logger: memoryLogger(), chamadas: () => chamadas };
}

const okFetch: FetchFn = async () => jsonResponse(FIXTURE.resposta);
const falhaRede: FetchFn = async () => {
  throw new TypeError('fetch failed: getaddrinfo ENOTFOUND router.project-osrm.org');
};

describe('RouteGeometryService (T20, RF24, TC29)', () => {
  it('TC29 (a): OSRM respondendo → fonte "osrm" com as coordenadas da rota', async () => {
    const { service, logger } = setup(okFetch);
    const geometria = await service.calcular(MASP, SE, { logger });
    expect(GeometrySchema.parse(geometria)).toEqual(geometria);
    expect(geometria.fonte).toBe('osrm');
    expect(geometria.coordenadas).toHaveLength(189);
    expect(geometria.coordenadas![0]).toEqual([-46.655871, -23.561539]);
  });

  it('TC29 (b): host do OSRM bloqueado → "linha-reta" [origem, destino] sem exceção', async () => {
    const { service, logger } = setup(falhaRede);
    const geometria = await service.calcular(MASP, SE, { logger });
    expect(geometria).toEqual({ fonte: 'linha-reta', coordenadas: LINHA_RETA });
    expect(GeometrySchema.parse(geometria)).toEqual(geometria);
    expect(logger.lines.some((l) => l.level === 'warn' && l.obj.erro === 'network')).toBe(true);
  });

  it('timeout do OSRM → linha reta', async () => {
    const { service, logger } = setup(hangingFetch(), { timeoutMs: 30 });
    const geometria = await service.calcular(MASP, SE, { logger });
    expect(geometria.fonte).toBe('linha-reta');
    expect(logger.lines.some((l) => l.obj.erro === 'timeout')).toBe(true);
  });

  it('HTTP 5xx e resposta fora do schema → linha reta', async () => {
    const http = setup(async () => jsonResponse({ message: 'Too Many Requests' }, 429));
    expect((await http.service.calcular(MASP, SE, { logger: http.logger })).fonte).toBe('linha-reta');
    const schema = setup(async () => jsonResponse({ code: 'NoRoute', routes: [] }));
    expect((await schema.service.calcular(MASP, SE, { logger: schema.logger })).fonte).toBe('linha-reta');
  });

  it('breaker aberto após 3 falhas: a 4ª nem chama o OSRM e sai linha reta', async () => {
    const { service, logger, chamadas } = setup(falhaRede);
    const destinos = [SE, { lat: -23.56, lon: -46.64 }, { lat: -23.57, lon: -46.65 }, { lat: -23.58, lon: -46.66 }];
    for (const destino of destinos) {
      expect((await service.calcular(MASP, destino, { logger })).fonte).toBe('linha-reta');
    }
    expect(chamadas()).toBe(3);
    expect(logger.lines.some((l) => l.obj.erro === 'circuit-open')).toBe(true);
  });

  it('prazo do briefing já esgotado → linha reta', async () => {
    const { service, logger, chamadas } = setup(okFetch);
    const geometria = await service.calcular(MASP, SE, { logger, signal: AbortSignal.abort() });
    expect(geometria.fonte).toBe('linha-reta');
    expect(chamadas()).toBe(0);
  });

  it('cache: 2º briefing do mesmo trajeto não chama o OSRM; rota vencida no cache ainda vale como "osrm"', async () => {
    let falhar = false;
    const { clock, service, logger, chamadas } = setup(async (input, init) => (falhar ? falhaRede(input, init) : okFetch(input, init)));
    await service.calcular(MASP, SE, { logger });
    expect((await service.calcular(MASP, SE, { logger })).fonte).toBe('osrm');
    expect(chamadas()).toBe(1);

    falhar = true;
    clock.advance(8 * 24 * 3_600_000); // TTL de 7 dias vencido; ainda ≤ 3×TTL
    const geometria = await service.calcular(MASP, SE, { logger });
    expect(geometria.fonte).toBe('osrm');
    expect(geometria.coordenadas).toHaveLength(189);
  });

  it('erro inesperado do cache não derruba o briefing', async () => {
    const quebrado: CachePort = {
      get: async () => {
        throw new Error('cache fora');
      },
      set: async () => undefined,
      getStale: async () => undefined,
      delete: async () => undefined,
    };
    const { service, logger } = setup(okFetch, { cache: quebrado });
    expect(await service.calcular(MASP, SE, { logger })).toEqual({ fonte: 'linha-reta', coordenadas: LINHA_RETA });
    expect(logger.lines.some((l) => l.level === 'warn' && l.obj.erro === 'inesperado')).toBe(true);
  });

  it('alterar a geometria devolvida não altera o cache', async () => {
    const { service, logger } = setup(okFetch);
    const primeira = await service.calcular(MASP, SE, { logger });
    primeira.coordenadas![0]![0] = 0;
    const segunda = await service.calcular(MASP, SE, { logger });
    expect(segunda.coordenadas![0]).toEqual([-46.655871, -23.561539]);
  });

  it('linhaReta usa [lon, lat]', () => {
    expect(linhaReta(MASP, SE)).toEqual({ fonte: 'linha-reta', coordenadas: LINHA_RETA });
  });

  it('OSRM preenche distanciaM', async () => {
    const { service, logger } = setup(okFetch);
    expect((await service.calcular(MASP, SE, { logger })).distanciaM).toBe(FIXTURE.resposta.routes[0].distance);
  });

  it('sem TomTom: trânsito unavailable com motivo de configuração', async () => {
    const { service, logger } = setup(okFetch);
    const { transito } = await service.calcularComTransito(MASP, SE, { logger });
    expect(ObservationSchema.parse(transito)).toMatchObject({ dimension: 'traffic', source: 'tomtom', status: 'unavailable', motivo: MOTIVO_SEM_TOMTOM });
  });
});

describe('RouteGeometryService com TomTom (RF22/RF24, 14/10/2026)', () => {
  const CARRO = JSON.parse(readFileSync(new URL('../../providers/routing/fixtures/tomtom-rota-carro-2026-10-13.json', import.meta.url), 'utf8'));

  function comTomTom(tomtomFetch: FetchFn, osrmFetch: FetchFn = okFetch) {
    const clock = new FakeClock();
    let osrmChamadas = 0;
    const osrm = new OsrmAdapter({
      http: createHttpClient({
        fetch: (u, i) => {
          osrmChamadas++;
          return osrmFetch(u, i);
        },
      }),
    });
    const rotas = createTomTomRotas({ chave: 'k', http: createHttpClient({ fetch: tomtomFetch }), clock });
    const runner = new ProviderRunner({ cache: new LruCache({ clock }), clock, rateLimiters: { [TOMTOM_SOURCE]: rotas.limiter } });
    return { clock, service: new RouteGeometryService(runner, osrm, rotas.carro), logger: memoryLogger(), osrmChamadas: () => osrmChamadas };
  }

  it('TomTom ok: geometria "tomtom" com distância e trânsito da mesma resposta; OSRM não é chamado', async () => {
    const { service, logger, osrmChamadas } = comTomTom(async () => jsonResponse(CARRO));
    const { geometria, transito } = await service.calcularComTransito(MASP, SE, { logger });
    expect(GeometrySchema.parse(geometria)).toMatchObject({ fonte: 'tomtom', distanciaM: 4073 });
    expect(geometria.coordenadas).toHaveLength(173);
    expect(ObservationSchema.parse(transito)).toMatchObject({
      dimension: 'traffic',
      source: 'tomtom',
      status: 'fresh',
      ttlSeconds: 300,
      value: { distanciaM: 4073, duracaoLivreS: 586, duracaoAtualS: 597, atrasoS: 0, nivel: 'LIVRE', trechosLentos: [] },
    });
    expect(osrmChamadas()).toBe(0);
  });

  it('TomTom fora → OSRM (geometria) e trânsito unavailable com o motivo da TomTom', async () => {
    const { service, logger, osrmChamadas } = comTomTom(async () => jsonResponse('x', 403));
    const { geometria, transito } = await service.calcularComTransito(MASP, SE, { logger });
    expect(geometria.fonte).toBe('osrm');
    expect(transito).toMatchObject({ status: 'unavailable', motivo: 'TomTom recusou a chave (HTTP 403)' });
    expect(osrmChamadas()).toBe(1);
  });

  it('TomTom e OSRM fora → linha reta (só para o raio de alagamento)', async () => {
    const { service, logger } = comTomTom(async () => jsonResponse('x', 500), falhaRede);
    expect((await service.calcularComTransito(MASP, SE, { logger })).geometria).toEqual({ fonte: 'linha-reta', coordenadas: LINHA_RETA });
  });

  it('cache vencido da TomTom (TTL 5 min) com a fonte fora: trânsito stale e geometria ainda "tomtom"', async () => {
    let falhar = false;
    const { service, logger, clock } = comTomTom(async () => (falhar ? jsonResponse('x', 503) : jsonResponse(CARRO)));
    await service.calcularComTransito(MASP, SE, { logger });
    falhar = true;
    clock.advance(6 * 60_000);
    const { geometria, transito } = await service.calcularComTransito(MASP, SE, { logger });
    expect(geometria.fonte).toBe('tomtom');
    expect(transito).toMatchObject({ status: 'stale', motivo: expect.stringMatching(/^TomTom fora do ar \(HTTP 503\); usando dado de 6 min/) });
  });

  it('sem noTrafficTravelTimeInSeconds: livre = atual − atraso; nível pela razão', () => {
    expect(
      valorTransito({ coordenadas: [], distanciaM: 1, duracaoS: 1500, duracaoLivreS: null, atrasoS: 900, trechosLentos: [] }),
    ).toMatchObject({ duracaoLivreS: 600, duracaoAtualS: 1500, nivel: 'PARADO' });
  });
});
