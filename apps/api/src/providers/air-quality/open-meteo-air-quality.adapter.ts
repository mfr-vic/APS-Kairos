// Adaptador Open-Meteo Air Quality (T17, RF07): MP2,5 da hora, média de 24 h (RN05) e US AQI.
// Modelo CAMS global (~45 km): o valor é sempre estimativa de modelo, nunca medição de estação (spike T03).
//
// Entrada: um ponto (LatLon); quem chama passa a ORIGEM do trajeto, como no clima. Com a grade de
// ~45 km, qualquer ponto do município cai em poucas células, e a chave de cache arredondada aproveita isso.
import type { AirValue, LatLon } from '@kairos/contracts';
import { z } from 'zod';
import { systemClock, type Clock } from '../../infrastructure/clock.js';
import { SchemaValidationError } from '../../infrastructure/errors.js';
import { createHttpClient, truncar, type HttpClient } from '../../infrastructure/http-client.js';
import type { DimensionProvider, ProviderFetchContext, ProviderResult } from '../../infrastructure/provider.js';
import { classificarFaixaAr } from '../../modules/rules/air-quality.js';
import {
  OPEN_METEO_TIMEZONE,
  OpenMeteoLocalTimeSchema,
  UtcOffsetSecondsSchema,
  inicioDaHora,
  openMeteoTimeToIso,
 fimDoIntervaloIso } from '../weather/open-meteo-time.js';

export const OPEN_METEO_AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

/**
 * Horas da média de MP2,5 (B.8, RN05): as 24 horas cheias ANTERIORES à hora corrente (carimbos de
 * H − 24 h a H − 1 h). Mínimo exigido: as 24, sem nenhum valor nulo; com qualquer falta a média é
 * null (contrato: "null sem 24 h de dados"), a faixa também, e a RN05 não dispara. No spike T03 a
 * série veio sem nulos, então a regra estrita não deve zerar a média na prática.
 */
export const HORAS_MEDIA_PM25 = 24;

/** Casas decimais das coordenadas na URL e na chave de cache (0,01° ≈ 1,1 km; a grade CAMS tem ~45 km). */
export const CASAS_COORDENADA = 2;

const HORA_MS = 60 * 60 * 1000;

/** Resposta da Air Quality API com `current` e `hourly` pedidos na URL (fixture do spike T03). */
export const OpenMeteoAirQualityResponseSchema = z
  .object({
    utc_offset_seconds: UtcOffsetSecondsSchema,
    current: z.object({
      time: OpenMeteoLocalTimeSchema,
      interval: z.number().int().positive(),
      pm2_5: z.number().min(0),
      us_aqi: z.number().min(0),
    }),
    hourly: z.object({
      time: z.array(OpenMeteoLocalTimeSchema),
      pm2_5: z.array(z.number().min(0).nullable()),
    }),
  })
  .superRefine((r, ctx) => {
    if (r.hourly.pm2_5.length !== r.hourly.time.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['hourly', 'pm2_5'],
        message: `tamanho ${r.hourly.pm2_5.length} diferente de hourly.time (${r.hourly.time.length})`,
      });
    }
  });

export type OpenMeteoAirQualityResponse = z.infer<typeof OpenMeteoAirQualityResponseSchema>;

function arredondar(valor: number): string {
  return valor.toFixed(CASAS_COORDENADA);
}

export function montarUrlAirQuality(ponto: LatLon): string {
  const params = new URLSearchParams({
    latitude: arredondar(ponto.lat),
    longitude: arredondar(ponto.lon),
    current: 'pm2_5,us_aqi',
    hourly: 'pm2_5',
    timezone: OPEN_METEO_TIMEZONE,
    // Ontem 00:00 → hoje 23:00: as 24 h anteriores a qualquer hora de hoje estão na série
    past_days: '1',
    forecast_days: '1',
  });
  return `${OPEN_METEO_AIR_QUALITY_URL}?${params.toString()}`;
}

/**
 * Média de MP2,5 das 24 horas anteriores à hora corrente (ver HORAS_MEDIA_PM25).
 * null se a série não cobrir as 24 horas ou se alguma delas for nula.
 */
export function calcularMediaPm25(r: OpenMeteoAirQualityResponse): number | null {
  const offset = r.utc_offset_seconds;
  const paraMs = (horaLocal: string) => Date.parse(openMeteoTimeToIso(horaLocal, offset));
  const horaCorrente = inicioDaHora(r.current.time);
  const fim = r.hourly.time.indexOf(horaCorrente);
  if (fim < HORAS_MEDIA_PM25) return null;

  const inicio = fim - HORAS_MEDIA_PM25;
  // A série da Open-Meteo é horária e contínua; se não for, não arrisca uma média errada
  if (paraMs(r.hourly.time[inicio]!) !== paraMs(horaCorrente) - HORAS_MEDIA_PM25 * HORA_MS) return null;

  let soma = 0;
  for (let i = inicio; i < fim; i++) {
    const valor = r.hourly.pm2_5[i];
    if (valor == null) return null;
    soma += valor;
  }
  return soma / HORAS_MEDIA_PM25;
}

/** Converte a resposta em AirValue; `faixa` vem da média de 24 h (B.8). */
export function mapearAirQuality(r: OpenMeteoAirQualityResponse, agoraMs: number): ProviderResult<AirValue> {
  if (!r.hourly.time.includes(inicioDaHora(r.current.time))) {
    throw new SchemaValidationError(
      [{ path: 'hourly.time', message: `hora corrente ${inicioDaHora(r.current.time)} ausente da série horária` }],
      truncar(JSON.stringify([r.hourly.time[0], r.hourly.time.at(-1)])),
    );
  }
  const pm25Media24h = calcularMediaPm25(r);
  return {
    value: {
      pm25: r.current.pm2_5,
      pm25Media24h,
      indice: Math.round(r.current.us_aqi),
      escalaIndice: 'US_AQI',
      faixa: classificarFaixaAr(pm25Media24h),
      estimativaDeModelo: true,
    },
    observedAt: fimDoIntervaloIso(r.current.time, r.utc_offset_seconds, r.current.interval, agoraMs),
  };
}

export class OpenMeteoAirQualityAdapter implements DimensionProvider<LatLon, 'air'> {
  readonly source = 'open-meteo-air-quality';
  readonly dimension = 'air' as const;
  readonly ttlSeconds = 60 * 60; // C.5
  readonly timeoutMs = 3_000; // C.5
  readonly refreshAhead = true;

  constructor(
    private readonly http: HttpClient = createHttpClient(),
    private readonly clock: Clock = systemClock,
  ) {}

  cacheKey(ponto: LatLon): string {
    return `${arredondar(ponto.lat)},${arredondar(ponto.lon)}`;
  }

  async fetch(ponto: LatLon, ctx: ProviderFetchContext): Promise<ProviderResult<AirValue>> {
    const resposta = await this.http.requestJson(montarUrlAirQuality(ponto), OpenMeteoAirQualityResponseSchema, {
      signal: ctx.signal,
      timeoutMs: ctx.timeoutMs ?? this.timeoutMs,
    });
    return mapearAirQuality(resposta, this.clock.now());
  }
}
