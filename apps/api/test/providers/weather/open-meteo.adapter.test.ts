// T17 / RF06: adaptador Open-Meteo Forecast contra fixture real e variações sintéticas.
// Nenhum teste chama a rede: o http-client recebe um fetch falso.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ObservationSchema, WeatherValueSchema } from '@kairos/contracts';
import { LruCache } from '../../../src/infrastructure/cache/lru-cache.js';
import { SchemaValidationError } from '../../../src/infrastructure/errors.js';
import { KAIROS_USER_AGENT, createHttpClient, type FetchFn } from '../../../src/infrastructure/http-client.js';
import { ProviderRunner } from '../../../src/infrastructure/provider-runner.js';
import { OpenMeteoAdapter, montarUrlForecast } from '../../../src/providers/weather/open-meteo.adapter.js';
import { FakeClock, jsonResponse, memoryLogger } from '../../infrastructure/helpers.js';

// Fixture real de 12/10/2026 (Praça da Sé, URL do contrato 1.2.0: current com weather_code, apparent_temperature,
// relative_humidity_2m, uv_index; daily com sunrise, sunset, temperature_2m_max/min;
// current.time 15:45, 48 horas a partir de 00:00, daily com 2 dias)
const FIXTURE = JSON.parse(
  readFileSync(new URL('./fixtures/forecast-2026-10-12.json', import.meta.url), 'utf8'),
) as Record<string, unknown> & {
  current: Record<string, unknown>;
  hourly: Record<string, unknown[]>;
  daily?: { time: string[]; sunrise: string[]; sunset: string[]; temperature_2m_max: (number | null)[] };
};

const SE = { lat: -23.5505, lon: -46.6333 };
// Relógio bem depois do fixture: observedAt = fim do intervalo de `current` (C.5, opção B)
const DEPOIS = new FakeClock(Date.parse('2026-10-13T12:00:00Z'));
const sinal = () => new AbortController().signal;

function copia(): typeof FIXTURE {
  return structuredClone(FIXTURE);
}

/** fetch falso que devolve sempre o mesmo corpo e guarda as chamadas. */
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
  return { adapter: new OpenMeteoAdapter(createHttpClient({ fetch: falso.fetch }), DEPOIS), chamadas: falso.chamadas };
}

describe('OpenMeteoAdapter (T17, RF06)', () => {
  it('mapeia o fixture real: atual (com vento, código, sensação, umidade, UV), hoje, sol e 7 horas a partir da hora corrente', async () => {
    const { adapter } = adaptador(FIXTURE);
    const r = await adapter.fetch(SE, { signal: sinal() });

    expect(r.observedAt).toBe('2026-10-12T16:00:00-03:00'); // 15:45 + interval 900 s
    expect(r.value.atual).toEqual({
      temperaturaC: 20.3,
      precipitacaoMm: 0.7,
      ventoKmH: 4,
      codigoTempo: 81,
      sensacaoC: 22.6,
      umidadePct: 87,
      uv: 3.2,
    });
    expect(r.value.hoje).toEqual({ temperaturaMaxC: 24.9, temperaturaMinC: 17.2 });
    expect(r.value.sol).toEqual({ nascer: '2026-10-12T05:36:00-03:00', por: '2026-10-12T18:09:00-03:00' });
    expect(r.value.horas).toHaveLength(7);
    expect(r.value.horas[0]).toEqual({
      hora: '2026-10-12T15:00:00-03:00',
      precipitacaoMm: 3.7,
      probabilidadePrecipitacao: 90,
      temperaturaC: 21,
    });
    expect(r.value.horas.map((h) => h.hora.slice(11))).toEqual([
      '15:00:00-03:00',
      '16:00:00-03:00',
      '17:00:00-03:00',
      '18:00:00-03:00',
      '19:00:00-03:00',
      '20:00:00-03:00',
      '21:00:00-03:00',
    ]);
    expect(r.value.horas.map((h) => h.precipitacaoMm)).toEqual([3.7, 2.8, 0.1, 0.1, 0.2, 0, 0]);
    expect(r.value.horas.map((h) => h.probabilidadePrecipitacao)).toEqual([90, 97, 96, 88, 67, 38, 16]);
    expect(r.value.horas.map((h) => h.temperaturaC)).toEqual([21, 20.3, 21, 20.7, 20.2, 19.5, 18.9]);
    // 15:00 em São Paulo = 18:00 UTC
    expect(new Date(r.value.horas[0]!.hora).toISOString()).toBe('2026-10-12T18:00:00.000Z');
    expect(WeatherValueSchema.parse(r.value)).toEqual(r.value);
  });

  it('monta a URL com current, hourly, daily, fuso de SP e coordenadas com 2 casas; envia o User-Agent do projeto', async () => {
    const { adapter, chamadas } = adaptador(FIXTURE);
    await adapter.fetch(SE, { signal: sinal() });

    expect(chamadas).toHaveLength(1);
    const url = new URL(chamadas[0]!.url);
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(url.searchParams.get('latitude')).toBe('-23.55');
    expect(url.searchParams.get('longitude')).toBe('-46.63');
    expect(url.searchParams.get('current')).toBe(
      'temperature_2m,precipitation,wind_speed_10m,weather_code,apparent_temperature,relative_humidity_2m,uv_index',
    );
    expect(url.searchParams.get('hourly')).toBe('temperature_2m,precipitation,precipitation_probability');
    expect(url.searchParams.get('daily')).toBe('sunrise,sunset,temperature_2m_max,temperature_2m_min');
    expect(url.searchParams.get('timezone')).toBe('America/Sao_Paulo');
    expect(url.searchParams.get('forecast_days')).toBe('2');
    expect(chamadas[0]!.headers['User-Agent']).toBe(KAIROS_USER_AGENT);
    expect(montarUrlForecast(SE)).toBe(chamadas[0]!.url);
  });

  it('cacheKey arredonda a 2 casas: pontos a menos de ~1 km dividem a entrada', () => {
    const adapter = new OpenMeteoAdapter(createHttpClient({ fetch: fetchFalso(FIXTURE).fetch }));
    expect(adapter.cacheKey(SE)).toBe('-23.55,-46.63');
    expect(adapter.cacheKey({ lat: -23.5512, lon: -46.6349 })).toBe('-23.55,-46.63');
    expect(adapter.cacheKey({ lat: -23.5612, lon: -46.6333 })).toBe('-23.56,-46.63');
  });

  it('current.time em hora cheia exata → série começa nela mesma', async () => {
    const corpo = copia();
    corpo.current.time = '2026-10-12T08:00';
    const { adapter } = adaptador(corpo);
    const r = await adapter.fetch(SE, { signal: sinal() });

    expect(r.observedAt).toBe('2026-10-12T08:15:00-03:00');
    expect(r.value.horas[0]!.hora).toBe('2026-10-12T08:00:00-03:00');
    expect(r.value.horas).toHaveLength(7);
  });

  it('perto do fim da série devolve só as horas existentes (22:00 do 2º dia → 22h e 23h)', async () => {
    const corpo = copia();
    corpo.current.time = '2026-10-13T22:00';
    const { adapter } = adaptador(corpo);
    const r = await adapter.fetch(SE, { signal: sinal() });

    expect(r.value.horas.map((h) => h.hora)).toEqual(['2026-10-13T22:00:00-03:00', '2026-10-13T23:00:00-03:00']);
    // Dia corrente = 2º dia do daily
    expect(r.value.sol).toEqual({ nascer: '2026-10-13T05:35:00-03:00', por: '2026-10-13T18:10:00-03:00' });
    expect(r.value.hoje).toEqual({ temperaturaMaxC: 28, temperaturaMinC: 17.2 });
  });

  it('hora com precipitação nula é omitida; probabilidade nula vira null', async () => {
    const corpo = copia();
    corpo.hourly.precipitation![16] = null; // 16:00
    corpo.hourly.precipitation_probability![17] = null; // 17:00
    const { adapter } = adaptador(corpo);
    const r = await adapter.fetch(SE, { signal: sinal() });

    expect(r.value.horas.map((h) => h.hora.slice(11, 16))).toEqual(['15:00', '17:00', '18:00', '19:00', '20:00', '21:00']);
    expect(r.value.horas[1]!.probabilidadePrecipitacao).toBeNull();
    expect(WeatherValueSchema.safeParse(r.value).success).toBe(true);
  });

  it('sem `daily` na resposta → sol e hoje null, sem derrubar a observação', async () => {
    const corpo = copia();
    delete corpo.daily;
    const { adapter } = adaptador(corpo);
    const r = await adapter.fetch(SE, { signal: sinal() });

    expect(r.value.sol).toBeNull();
    expect(r.value.hoje).toBeNull();
    expect(r.value.horas).toHaveLength(7);
    expect(WeatherValueSchema.safeParse(r.value).success).toBe(true);
  });

  it('dia corrente ausente do daily → sol e hoje null', async () => {
    const corpo = copia();
    corpo.daily!.time = ['2026-10-14', '2026-10-15'];
    const { adapter } = adaptador(corpo);
    const r = await adapter.fetch(SE, { signal: sinal() });

    expect(r.value.sol).toBeNull();
    expect(r.value.hoje).toBeNull();
  });

  it('máxima nula no daily → hoje null', async () => {
    const corpo = copia();
    corpo.daily!.temperature_2m_max[0] = null;
    const { adapter } = adaptador(corpo);
    const r = await adapter.fetch(SE, { signal: sinal() });

    expect(r.value.hoje).toBeNull();
    expect(WeatherValueSchema.safeParse(r.value).success).toBe(true);
  });

  it('vento, código do tempo, sensação, umidade e UV nulos são tolerados: ficam null', async () => {
    const corpo = copia();
    corpo.current.wind_speed_10m = null;
    corpo.current.weather_code = null;
    corpo.current.apparent_temperature = null;
    corpo.current.relative_humidity_2m = null;
    corpo.current.uv_index = null;
    const { adapter } = adaptador(corpo);
    const r = await adapter.fetch(SE, { signal: sinal() });

    expect(r.value.atual).toEqual({
      temperaturaC: 20.3,
      precipitacaoMm: 0.7,
      ventoKmH: null,
      codigoTempo: null,
      sensacaoC: null,
      umidadePct: null,
      uv: null,
    });
    expect(WeatherValueSchema.safeParse(r.value).success).toBe(true);
  });

  it('usa utc_offset_seconds da resposta no fuso dos horários', async () => {
    const corpo = copia();
    corpo.utc_offset_seconds = 0;
    const { adapter } = adaptador(corpo);
    const r = await adapter.fetch(SE, { signal: sinal() });
    expect(r.observedAt).toBe('2026-10-12T16:00:00+00:00');
  });

  it.each([
    ['sem hourly.precipitation', (c: typeof FIXTURE) => delete c.hourly.precipitation],
    ['temperatura atual como texto', (c: typeof FIXTURE) => (c.current.temperature_2m = '21,6')],
    ['horário com fuso inesperado', (c: typeof FIXTURE) => (c.current.time = '2026-10-10T08:00Z')],
    ['séries horárias de tamanhos diferentes', (c: typeof FIXTURE) => c.hourly.temperature_2m!.pop()],
    ['sem utc_offset_seconds', (c: typeof FIXTURE) => delete c.utc_offset_seconds],
    ['código do tempo fora de 0–99', (c: typeof FIXTURE) => (c.current.weather_code = 100)],
    ['hora corrente fora da série', (c: typeof FIXTURE) => (c.current.time = '2026-10-15T08:00')],
  ])('resposta malformada (%s) → SchemaValidationError', async (_nome, estragar) => {
    const corpo = copia();
    estragar(corpo);
    const { adapter } = adaptador(corpo);
    await expect(adapter.fetch(SE, { signal: sinal() })).rejects.toBeInstanceOf(SchemaValidationError);
  });
});

describe('OpenMeteoAdapter + ProviderRunner (T16/T17)', () => {
  function setup(corpo: unknown) {
    // 15:50 em São Paulo: 5 min depois do current.time do fixture
    const clock = new FakeClock(Date.parse('2026-10-12T18:50:00Z'));
    const runner = new ProviderRunner({ cache: new LruCache({ clock }), clock });
    const falso = fetchFalso(corpo);
    const adapter = new OpenMeteoAdapter(createHttpClient({ fetch: falso.fetch }), clock);
    return { clock, runner, adapter, chamadas: falso.chamadas, logger: memoryLogger() };
  }

  it('gera Observation fresh válida no ObservationSchema e reaproveita o cache para ponto vizinho', async () => {
    const { runner, adapter, chamadas, logger } = setup(FIXTURE);
    const obs = await runner.observe(adapter, SE, { logger });

    expect(ObservationSchema.parse(obs)).toMatchObject({
      dimension: 'weather',
      source: 'open-meteo',
      status: 'fresh',
      observedAt: '2026-10-12T15:50:00-03:00', // fim do intervalo (16:00) limitado a agora
      ttlSeconds: 900,
    });
    expect(obs.value?.horas).toHaveLength(7);

    await runner.observe(adapter, { lat: -23.5512, lon: -46.6349 }, { logger });
    expect(chamadas).toHaveLength(1);
  });

  it('resposta malformada → unavailable com motivo, válida no ObservationSchema', async () => {
    const corpo = copia();
    delete corpo.hourly.precipitation;
    const { runner, adapter, logger } = setup(corpo);
    const obs = await runner.observe(adapter, SE, { logger });

    expect(ObservationSchema.parse(obs)).toMatchObject({
      dimension: 'weather',
      status: 'unavailable',
      value: null,
      motivo: 'A fonte respondeu em formato inesperado',
    });
    expect(logger.lines.find((l) => l.msg === 'falha no provedor')?.obj).toMatchObject({ erro: 'schema' });
  });

  it('JSON inválido → unavailable', async () => {
    const { runner, adapter, logger } = setup('<html>erro</html>');
    const obs = await runner.observe(adapter, SE, { logger });
    expect(ObservationSchema.parse(obs).status).toBe('unavailable');
  });
});
