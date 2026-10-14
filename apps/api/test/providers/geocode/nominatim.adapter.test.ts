import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GeocodeResponseSchema } from '@kairos/contracts';
import { LruCache } from '../../../src/infrastructure/cache/lru-cache.js';
import { SchemaValidationError } from '../../../src/infrastructure/errors.js';
import { createHttpClient, KAIROS_USER_AGENT, type FetchFn } from '../../../src/infrastructure/http-client.js';
import { ProviderRunner } from '../../../src/infrastructure/provider-runner.js';
import { MinIntervalLimiter, RATE_LIMITS } from '../../../src/infrastructure/rate-limiter.js';
import {
  NOMINATIM_SOURCE,
  NOMINATIM_TTL_SECONDS,
  NominatimAdapter,
  NominatimSearchResponseSchema,
  mapearBuscaNominatim,
  rotuloLegivel,
} from '../../../src/providers/geocode/nominatim.adapter.js';
import { FakeClock, jsonResponse, memoryLogger } from '../../infrastructure/helpers.js';

// Respostas reais do spike T08 (10/10/2026)
const FIXTURE = JSON.parse(
  readFileSync(new URL('../../../../../spikes/osrm-nominatim/fixture-geocode.json', import.meta.url), 'utf8'),
);
const PAULISTA = FIXTURE.respostas['Avenida Paulista, 1578, São Paulo'];
const SE = FIXTURE.respostas['Praça da Sé, São Paulo'];
const sinal = () => new AbortController().signal;

function fakeFetch(clock: FakeClock, responder: () => Response) {
  const chamadas: { url: URL; headers: Record<string, string>; em: number }[] = [];
  const fetch: FetchFn = async (input, init) => {
    chamadas.push({ url: new URL(String(input)), headers: (init?.headers ?? {}) as Record<string, string>, em: clock.now() });
    return responder();
  };
  return { fetch, chamadas };
}

function setup(responder: () => Response = () => jsonResponse(PAULISTA)) {
  const clock = new FakeClock();
  const { fetch, chamadas } = fakeFetch(clock, responder);
  const nominatim = new NominatimAdapter({ http: createHttpClient({ fetch }) });
  const limiter = new MinIntervalLimiter({
    intervalMs: RATE_LIMITS.umPorSegundoMs,
    clock,
    sleep: async (ms) => clock.advance(ms),
  });
  const runner = new ProviderRunner({
    cache: new LruCache({ clock }),
    clock,
    rateLimiters: { [NOMINATIM_SOURCE]: limiter },
  });
  return { clock, nominatim, runner, chamadas, logger: memoryLogger() };
}

describe('NominatimAdapter (T20, RF01)', () => {
  it('busca limitada a São Paulo (viewbox + bounded do spike), com User-Agent e pt-BR', async () => {
    const { nominatim, chamadas } = setup();
    await nominatim.fetch('  Avenida   Paulista, 1578,  São Paulo ', { signal: sinal() });
    const { url, headers } = chamadas[0]!;
    expect(`${url.origin}${url.pathname}`).toBe('https://nominatim.openstreetmap.org/search');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      format: 'jsonv2',
      q: 'Avenida Paulista, 1578, São Paulo',
      countrycodes: 'br',
      viewbox: '-46.83,-23.35,-46.36,-24.01',
      bounded: '1',
      limit: '5',
    });
    expect(headers['User-Agent']).toBe(KAIROS_USER_AGENT);
    expect(headers['Accept-Language']).toBe('pt-BR');
    expect(nominatim.ttlSeconds).toBe(NOMINATIM_TTL_SECONDS);
    expect(NOMINATIM_TTL_SECONDS).toBe(2_592_000);
  });

  it('mapeia o fixture real para o GeocodeResponse (lat/lon numéricos, rótulo legível)', () => {
    const resposta = mapearBuscaNominatim(NominatimSearchResponseSchema.parse(PAULISTA));
    expect(GeocodeResponseSchema.parse(resposta)).toEqual(resposta);
    expect(resposta.resultados).toHaveLength(2);
    expect(resposta.resultados[0]).toEqual({
      lat: -23.5614961,
      lon: -46.6559677,
      rotulo: 'Museu de Arte de São Paulo, 1578, Avenida Paulista, Cerqueira César, Bela Vista, São Paulo, 01310-200',
    });
    const se = mapearBuscaNominatim(NominatimSearchResponseSchema.parse(SE));
    expect(se.resultados).toHaveLength(5);
    expect(se.resultados[0]!.rotulo).toBe('Praça da Sé, Glicério, Sé, São Paulo, 01001-000');
  });

  it('rótulo: tira "Região …" e "Brasil"; mantém o resto', () => {
    expect(rotuloLegivel('Rua X, Sé, São Paulo, Região Sudeste, 01001-000, Brasil')).toBe('Rua X, Sé, São Paulo, 01001-000');
    expect(rotuloLegivel('Brasil')).toBe('Brasil');
  });

  it('nenhum resultado → lista vazia (não é falha)', async () => {
    const { nominatim } = setup(() => jsonResponse([]));
    expect((await nominatim.fetch('rua que não existe', { signal: sinal() })).value).toEqual({ resultados: [] });
  });

  it('lat fora do intervalo ou não numérica → SchemaValidationError', async () => {
    const ruim = [{ ...PAULISTA[0], lat: '-123.4' }];
    const { nominatim } = setup(() => jsonResponse(ruim));
    await expect(nominatim.fetch('Avenida Paulista', { signal: sinal() })).rejects.toBeInstanceOf(SchemaValidationError);
    const { nominatim: n2 } = setup(() => jsonResponse([{ ...PAULISTA[0], lon: 'abc' }]));
    await expect(n2.fetch('Avenida Paulista', { signal: sinal() })).rejects.toBeInstanceOf(SchemaValidationError);
  });

  it('chave de cache normalizada: caixa e espaços não importam', () => {
    const nominatim = new NominatimAdapter();
    expect(nominatim.cacheKey('  AVENIDA  Paulista,\t1578 ')).toBe('avenida paulista, 1578');
    expect(nominatim.cacheKey('avenida paulista, 1578')).toBe('avenida paulista, 1578');
  });

  it('cache: a mesma consulta (outra caixa, 29 dias depois) não chama a fonte de novo', async () => {
    const { clock, nominatim, runner, chamadas, logger } = setup();
    const primeira = await runner.execute(nominatim, 'Avenida Paulista, 1578, São Paulo', { logger });
    clock.advance(29 * 24 * 3_600_000);
    const segunda = await runner.execute(nominatim, ' avenida paulista, 1578, são paulo', { logger });
    expect(chamadas).toHaveLength(1);
    expect([primeira.cache, segunda.cache]).toEqual(['miss', 'hit']);
    expect(segunda.value).toEqual(primeira.value);
  });

  it('fila serial: consultas seguidas saem com ≥ 1,1 s de intervalo', async () => {
    const { nominatim, runner, chamadas, logger } = setup();
    for (const q of ['Avenida Paulista, 1578', 'Praça da Sé', 'Estação da Luz']) {
      await runner.execute(nominatim, q, { logger });
    }
    expect(chamadas).toHaveLength(3);
    const intervalos = chamadas.slice(1).map((c, i) => c.em - chamadas[i]!.em);
    expect(intervalos.every((ms) => ms >= 1_100)).toBe(true);
  });
});
