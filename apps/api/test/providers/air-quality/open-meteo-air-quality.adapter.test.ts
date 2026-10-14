// T17 / RF07 / RN05: adaptador Open-Meteo Air Quality contra o fixture real do spike T03 e variações.
// Nenhum teste chama a rede: o http-client recebe um fetch falso.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AirValueSchema, ObservationSchema } from '@kairos/contracts';
import { LruCache } from '../../../src/infrastructure/cache/lru-cache.js';
import { SchemaValidationError } from '../../../src/infrastructure/errors.js';
import { KAIROS_USER_AGENT, createHttpClient, type FetchFn } from '../../../src/infrastructure/http-client.js';
import { ProviderRunner } from '../../../src/infrastructure/provider-runner.js';
import {
  OpenMeteoAirQualityAdapter,
  montarUrlAirQuality,
} from '../../../src/providers/air-quality/open-meteo-air-quality.adapter.js';
import { FakeClock, jsonResponse, memoryLogger } from '../../infrastructure/helpers.js';

// Fixture real do spike T03 (10/10/2026, Sé; current 08:00, 48 horas a partir de 00:00, SEM past_days)
const FIXTURE = JSON.parse(
  readFileSync(new URL('../../../../../spikes/open-meteo/fixture-air-quality.json', import.meta.url), 'utf8'),
) as Record<string, unknown> & {
  current: Record<string, unknown>;
  hourly: Record<string, unknown[]>;
};

const SE = { lat: -23.5505, lon: -46.6333 };
// Relógio bem depois do fixture: observedAt = fim do intervalo de `current` (C.5, opção B)
const DEPOIS = new FakeClock(Date.parse('2026-10-12T12:00:00Z'));
const sinal = () => new AbortController().signal;

function copia(): typeof FIXTURE {
  return structuredClone(FIXTURE);
}

/**
 * Simula a resposta com past_days=1 usando os valores reais: a "hora corrente" passa a ser
 * 11/10 08:00 (índice 32), e as 24 horas anteriores são 10/10 08:00 → 11/10 07:00 (índices 8–31).
 */
function comPassado(): typeof FIXTURE {
  const c = copia();
  c.current.time = '2026-10-11T08:00';
  c.current.pm2_5 = c.hourly.pm2_5![32];
  c.current.us_aqi = c.hourly.us_aqi![32];
  return c;
}

// Média dos índices 8–31 do fixture: soma 772,5 / 24 = 32,1875 µg/m³
const MEDIA_FIXTURE_PASSADO = 772.5 / 24;

function fetchFalso(corpo: unknown) {
  const chamadas: { url: string; headers: Record<string, string> }[] = [];
  const fetch: FetchFn = async (input, init) => {
    chamadas.push({ url: String(input), headers: (init?.headers ?? {}) as Record<string, string> });
    return jsonResponse(corpo);
  };
  return { fetch, chamadas };
}

function adaptador(corpo: unknown) {
  const falso = fetchFalso(corpo);
  return {
    adapter: new OpenMeteoAirQualityAdapter(createHttpClient({ fetch: falso.fetch }), DEPOIS),
    chamadas: falso.chamadas,
  };
}

describe('OpenMeteoAirQualityAdapter (T17, RF07)', () => {
  it('fixture real sem past_days: pm25 e índice da hora; média null (só 8 horas antes das 08:00)', async () => {
    const { adapter } = adaptador(FIXTURE);
    const r = await adapter.fetch(SE, { signal: sinal() });

    expect(r.observedAt).toBe('2026-10-10T09:00:00-03:00'); // 08:00 + interval 3600 s
    expect(r.value).toEqual({
      pm25: 44.6,
      pm25Media24h: null,
      indice: 89,
      escalaIndice: 'US_AQI',
      faixa: null,
      estimativaDeModelo: true,
    });
    expect(AirValueSchema.parse(r.value)).toEqual(r.value);
  });

  it('com 24 horas anteriores completas: média das horas H−24 a H−1 e faixa pela média (B.8)', async () => {
    const { adapter } = adaptador(comPassado());
    const r = await adapter.fetch(SE, { signal: sinal() });

    expect(r.observedAt).toBe('2026-10-11T09:00:00-03:00');
    expect(r.value.pm25).toBe(44.2);
    expect(r.value.pm25Media24h).toBeCloseTo(MEDIA_FIXTURE_PASSADO, 10); // 32,1875 µg/m³
    expect(r.value.faixa).toBe('MODERADA'); // > 15 e ≤ 50
    expect(AirValueSchema.safeParse(r.value).success).toBe(true);
  });

  it('a hora corrente não entra na média', async () => {
    const c = comPassado();
    c.hourly.pm2_5![32] = 999; // valor da hora corrente (11/10 08:00)
    const { adapter } = adaptador(c);
    const r = await adapter.fetch(SE, { signal: sinal() });
    expect(r.value.pm25Media24h).toBeCloseTo(MEDIA_FIXTURE_PASSADO, 10);
  });

  it('média > 50 µg/m³ → faixa RUIM (base da RN05)', async () => {
    const c = comPassado();
    for (let i = 8; i < 32; i++) c.hourly.pm2_5![i] = 60;
    const { adapter } = adaptador(c);
    const r = await adapter.fetch(SE, { signal: sinal() });
    expect(r.value.pm25Media24h).toBe(60);
    expect(r.value.faixa).toBe('RUIM');
  });

  it('um valor nulo nas 24 horas → média e faixa null (mínimo = 24 de 24)', async () => {
    const c = comPassado();
    c.hourly.pm2_5![20] = null;
    const { adapter } = adaptador(c);
    const r = await adapter.fetch(SE, { signal: sinal() });
    expect(r.value.pm25Media24h).toBeNull();
    expect(r.value.faixa).toBeNull();
    expect(AirValueSchema.safeParse(r.value).success).toBe(true);
  });

  it('série com buraco de horário (não contínua) → média null', async () => {
    const c = comPassado();
    c.hourly.time![8] = '2026-10-10T07:30';
    const { adapter } = adaptador(c);
    const r = await adapter.fetch(SE, { signal: sinal() });
    expect(r.value.pm25Media24h).toBeNull();
  });

  it('us_aqi fracionário vira inteiro', async () => {
    const c = copia();
    c.current.us_aqi = 88.6;
    const { adapter } = adaptador(c);
    const r = await adapter.fetch(SE, { signal: sinal() });
    expect(r.value.indice).toBe(89);
  });

  it('monta a URL com past_days=1, fuso de SP e coordenadas com 2 casas; envia o User-Agent do projeto', async () => {
    const { adapter, chamadas } = adaptador(FIXTURE);
    await adapter.fetch(SE, { signal: sinal() });

    const url = new URL(chamadas[0]!.url);
    expect(url.origin + url.pathname).toBe('https://air-quality-api.open-meteo.com/v1/air-quality');
    expect(url.searchParams.get('latitude')).toBe('-23.55');
    expect(url.searchParams.get('longitude')).toBe('-46.63');
    expect(url.searchParams.get('current')).toBe('pm2_5,us_aqi');
    expect(url.searchParams.get('hourly')).toBe('pm2_5');
    expect(url.searchParams.get('timezone')).toBe('America/Sao_Paulo');
    expect(url.searchParams.get('past_days')).toBe('1');
    expect(url.searchParams.get('forecast_days')).toBe('1');
    expect(chamadas[0]!.headers['User-Agent']).toBe(KAIROS_USER_AGENT);
    expect(montarUrlAirQuality(SE)).toBe(chamadas[0]!.url);
    expect(adapter.cacheKey(SE)).toBe('-23.55,-46.63');
  });

  it.each([
    ['current.pm2_5 nulo', (c: typeof FIXTURE) => (c.current.pm2_5 = null)],
    ['sem current.us_aqi', (c: typeof FIXTURE) => delete c.current.us_aqi],
    ['pm2_5 horário negativo', (c: typeof FIXTURE) => (c.hourly.pm2_5![3] = -1)],
    ['séries de tamanhos diferentes', (c: typeof FIXTURE) => c.hourly.pm2_5!.pop()],
    ['hora corrente fora da série', (c: typeof FIXTURE) => (c.current.time = '2026-10-15T08:00')],
  ])('resposta malformada (%s) → SchemaValidationError', async (_nome, estragar) => {
    const c = copia();
    estragar(c);
    const { adapter } = adaptador(c);
    await expect(adapter.fetch(SE, { signal: sinal() })).rejects.toBeInstanceOf(SchemaValidationError);
  });
});

describe('OpenMeteoAirQualityAdapter + ProviderRunner (T16/T17)', () => {
  function setup(corpo: unknown, agoraUtc: string) {
    const clock = new FakeClock(Date.parse(agoraUtc));
    const runner = new ProviderRunner({ cache: new LruCache({ clock }), clock });
    const adapter = new OpenMeteoAirQualityAdapter(createHttpClient({ fetch: fetchFalso(corpo).fetch }), clock);
    return { clock, runner, adapter, logger: memoryLogger() };
  }

  it('gera Observation fresh válida no ObservationSchema', async () => {
    // 11/10 08:20 em São Paulo
    const { runner, adapter, logger } = setup(comPassado(), '2026-10-11T11:20:00Z');
    const obs = await runner.observe(adapter, SE, { logger });

    expect(ObservationSchema.parse(obs)).toMatchObject({
      dimension: 'air',
      source: 'open-meteo-air-quality',
      status: 'fresh',
      observedAt: '2026-10-11T08:20:00-03:00', // fim da hora (09:00) limitado a agora
      ttlSeconds: 3600,
      value: { escalaIndice: 'US_AQI', faixa: 'MODERADA', estimativaDeModelo: true },
    });
  });

  it('regressão (opção B): buscado às 08:20 e lido do cache às 09:19 continua fresh', async () => {
    // Antes, observedAt = 08:00 (início da hora) e a idade às 09:19 era 79 min > TTL de 60 → stale.
    const { clock, runner, adapter, logger } = setup(comPassado(), '2026-10-11T11:20:00Z');
    await runner.observe(adapter, SE, { logger });
    clock.advance(59 * 60_000);
    const obs = await runner.observe(adapter, SE, { logger });
    expect(obs.status).toBe('fresh');
  });

  it('resposta malformada → unavailable com motivo, válida no ObservationSchema', async () => {
    const c = copia();
    c.current.pm2_5 = 'n/d';
    const { runner, adapter, logger } = setup(c, '2026-10-10T11:20:00Z');
    const obs = await runner.observe(adapter, SE, { logger });

    expect(ObservationSchema.parse(obs)).toMatchObject({
      dimension: 'air',
      status: 'unavailable',
      value: null,
      motivo: 'A fonte respondeu em formato inesperado',
    });
  });
});
