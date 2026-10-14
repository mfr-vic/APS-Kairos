// Adaptador Open-Meteo Forecast (T17, RF06): clima atual + valores horários a partir da hora corrente.
// Formato da resposta e significado dos campos: spike T03 (spikes/open-meteo/NOTAS.md).
//
// Entrada: um ponto (LatLon). Quem chama (BriefingService, T27) deve passar a ORIGEM do trajeto: o
// briefing responde "posso sair agora?", e a condição relevante é a de onde a pessoa está. Os trajetos
// ficam dentro do município, e a fonte já ajusta o ponto para a célula do modelo (no spike, a Sé caiu
// numa célula a ~4,6 km), então consultar outros pontos do trajeto custaria mais chamadas sem ganho claro.
import type { LatLon, WeatherValue } from '@kairos/contracts';
import { z } from 'zod';
import { systemClock, type Clock } from '../../infrastructure/clock.js';
import { SchemaValidationError } from '../../infrastructure/errors.js';
import { createHttpClient, truncar, type HttpClient } from '../../infrastructure/http-client.js';
import type { DimensionProvider, ProviderFetchContext, ProviderResult } from '../../infrastructure/provider.js';
import {
  OPEN_METEO_TIMEZONE,
  OpenMeteoLocalTimeSchema,
  UtcOffsetSecondsSchema,
  inicioDaHora,
  openMeteoTimeToIso,
 fimDoIntervaloIso } from './open-meteo-time.js';

export const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

/** Hora corrente + 6 seguintes: cobre (agora, agora + 6 h] da B.8 (RF14). Máximo do contrato. */
export const HORAS_DE_PREVISAO = 7;

/** Casas decimais das coordenadas na URL e na chave de cache (0,01° ≈ 1,1 km em SP). */
export const CASAS_COORDENADA = 2;

const valoresHorarios = z.array(z.number().nullable());

/** Resposta da Forecast API com `current` e `hourly` pedidos na URL (fixture do spike T03). */
export const OpenMeteoForecastResponseSchema = z
  .object({
    utc_offset_seconds: UtcOffsetSecondsSchema,
    current: z.object({
      time: OpenMeteoLocalTimeSchema,
      interval: z.number().int().positive(),
      temperature_2m: z.number(),
      precipitation: z.number().min(0),
      wind_speed_10m: z.number().min(0).nullable(),
      weather_code: z.number().int().min(0).max(99).nullable(),
      apparent_temperature: z.number().nullable(),
      relative_humidity_2m: z.number().min(0).max(100).nullable(),
      uv_index: z.number().min(0).nullable(),
    }),
    // Nascer/pôr do sol e extremos por dia ("AAAA-MM-DD" + horas locais). Opcional: sem ele, `sol`/`hoje` null.
    daily: z
      .object({
        time: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
        sunrise: z.array(OpenMeteoLocalTimeSchema),
        sunset: z.array(OpenMeteoLocalTimeSchema),
        temperature_2m_max: z.array(z.number().nullable()),
        temperature_2m_min: z.array(z.number().nullable()),
      })
      .optional(),
    hourly: z.object({
      time: z.array(OpenMeteoLocalTimeSchema),
      temperature_2m: valoresHorarios,
      precipitation: valoresHorarios,
      precipitation_probability: valoresHorarios,
    }),
  })
  .superRefine((r, ctx) => {
    const n = r.hourly.time.length;
    for (const campo of ['temperature_2m', 'precipitation', 'precipitation_probability'] as const) {
      if (r.hourly[campo].length !== n) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['hourly', campo],
          message: `tamanho ${r.hourly[campo].length} diferente de hourly.time (${n})`,
        });
      }
    }
  });

export type OpenMeteoForecastResponse = z.infer<typeof OpenMeteoForecastResponseSchema>;

function arredondar(valor: number): string {
  return valor.toFixed(CASAS_COORDENADA);
}

export function montarUrlForecast(ponto: LatLon): string {
  const params = new URLSearchParams({
    latitude: arredondar(ponto.lat),
    longitude: arredondar(ponto.lon),
    current: 'temperature_2m,precipitation,wind_speed_10m,weather_code,apparent_temperature,relative_humidity_2m,uv_index',
    hourly: 'temperature_2m,precipitation,precipitation_probability',
    daily: 'sunrise,sunset,temperature_2m_max,temperature_2m_min',
    timezone: OPEN_METEO_TIMEZONE,
    // 2 dias: às 23h ainda há 6 horas seguintes na série
    forecast_days: '2',
  });
  return `${OPEN_METEO_FORECAST_URL}?${params.toString()}`;
}

/**
 * Converte a resposta em WeatherValue. `horas` começa na hora cheia de `current.time` e tem até 7 valores.
 * Horas com temperatura ou precipitação nulas são omitidas (as regras tratam hora ausente como sem dado).
 * Lança SchemaValidationError se a hora corrente não estiver na série horária.
 */
export function mapearForecast(r: OpenMeteoForecastResponse, agoraMs: number): ProviderResult<WeatherValue> {
  const offset = r.utc_offset_seconds;
  const horaCorrente = inicioDaHora(r.current.time);
  const inicio = r.hourly.time.indexOf(horaCorrente);
  if (inicio < 0) {
    throw new SchemaValidationError(
      [{ path: 'hourly.time', message: `hora corrente ${horaCorrente} ausente da série horária` }],
      truncar(JSON.stringify([r.hourly.time[0], r.hourly.time.at(-1)])),
    );
  }

  const horas: WeatherValue['horas'] = [];
  for (let i = inicio; i < Math.min(inicio + HORAS_DE_PREVISAO, r.hourly.time.length); i++) {
    const temperaturaC = r.hourly.temperature_2m[i];
    const precipitacaoMm = r.hourly.precipitation[i];
    const probabilidade = r.hourly.precipitation_probability[i];
    if (temperaturaC == null || precipitacaoMm == null) continue;
    horas.push({
      hora: openMeteoTimeToIso(r.hourly.time[i]!, offset),
      precipitacaoMm,
      probabilidadePrecipitacao: probabilidade == null ? null : Math.round(probabilidade),
      temperaturaC,
    });
  }

  // Nascer/pôr e extremos do dia da hora corrente; sem o dia no daily, `sol`/`hoje` null (não derruba a observação)
  const dia = r.current.time.slice(0, 10);
  const indiceDia = r.daily?.time.indexOf(dia) ?? -1;
  const nascer = indiceDia >= 0 ? r.daily?.sunrise[indiceDia] : undefined;
  const por = indiceDia >= 0 ? r.daily?.sunset[indiceDia] : undefined;
  const maxC = indiceDia >= 0 ? r.daily?.temperature_2m_max[indiceDia] : undefined;
  const minC = indiceDia >= 0 ? r.daily?.temperature_2m_min[indiceDia] : undefined;

  return {
    value: {
      atual: {
        temperaturaC: r.current.temperature_2m,
        precipitacaoMm: r.current.precipitation,
        ventoKmH: r.current.wind_speed_10m,
        codigoTempo: r.current.weather_code,
        sensacaoC: r.current.apparent_temperature,
        umidadePct: r.current.relative_humidity_2m,
        uv: r.current.uv_index,
      },
      hoje: maxC != null && minC != null ? { temperaturaMaxC: maxC, temperaturaMinC: minC } : null,
      sol:
        nascer != null && por != null
          ? { nascer: openMeteoTimeToIso(nascer, offset), por: openMeteoTimeToIso(por, offset) }
          : null,
      horas,
    },
    observedAt: fimDoIntervaloIso(r.current.time, offset, r.current.interval, agoraMs),
  };
}

export class OpenMeteoAdapter implements DimensionProvider<LatLon, 'weather'> {
  readonly source = 'open-meteo';
  readonly dimension = 'weather' as const;
  readonly ttlSeconds = 15 * 60; // C.5
  readonly timeoutMs = 3_000; // C.5
  readonly refreshAhead = true;

  constructor(
    private readonly http: HttpClient = createHttpClient(),
    private readonly clock: Clock = systemClock,
  ) {}

  /** Mesmas casas decimais da URL: pontos a menos de ~1 km dividem a entrada de cache. */
  cacheKey(ponto: LatLon): string {
    return `${arredondar(ponto.lat)},${arredondar(ponto.lon)}`;
  }

  async fetch(ponto: LatLon, ctx: ProviderFetchContext): Promise<ProviderResult<WeatherValue>> {
    const resposta = await this.http.requestJson(montarUrlForecast(ponto), OpenMeteoForecastResponseSchema, {
      signal: ctx.signal,
      timeoutMs: ctx.timeoutMs ?? this.timeoutMs,
    });
    return mapearForecast(resposta, this.clock.now());
  }
}
