// Camada de clima do mapa (RF23, contrato 1.4.0): chuva da próxima hora e temperatura em pontos fixos
// espalhados pela capital, numa ÚNICA chamada multi-coordenada da Open-Meteo (latitude/longitude em lista).
// Mesma fonte, TTL (15 min, C.5), breaker e cache do runner que o clima do briefing; nada por pixel.
import type { ImpactoMapa, MapaCamadasResponse } from '@kairos/contracts';
import { z } from 'zod';
import { SchemaValidationError } from '../../infrastructure/errors.js';
import { createHttpClient, type HttpClient } from '../../infrastructure/http-client.js';
import type { Provider, ProviderFetchContext, ProviderResult } from '../../infrastructure/provider.js';
import { CHUVA_FRACA_MAX_MM_H, CHUVA_MODERADA_MAX_MM_H } from '../rules/thresholds.js';
import { OPEN_METEO_FORECAST_URL } from '../../providers/weather/open-meteo.adapter.js';
import {
  OPEN_METEO_TIMEZONE,
  OpenMeteoLocalTimeSchema,
  UtcOffsetSecondsSchema,
  fimDoIntervaloIso,
  inicioDaHora,
  openMeteoTimeToIso,
} from '../../providers/weather/open-meteo-time.js';
import { systemClock, type Clock } from '../../infrastructure/clock.js';

/**
 * Centros aproximados (2 casas, ~1 km) de distritos espalhados pelo município, do extremo norte ao
 * extremo sul. A célula do modelo tem alguns km, então mais pontos custariam payload sem ganho.
 */
export const PONTOS_GRADE: readonly { regiao: string; lat: number; lon: number }[] = [
  { regiao: 'Sé', lat: -23.55, lon: -46.63 },
  { regiao: 'Santana', lat: -23.5, lon: -46.63 },
  { regiao: 'Pirituba', lat: -23.49, lon: -46.73 },
  { regiao: 'Lapa', lat: -23.53, lon: -46.7 },
  { regiao: 'Butantã', lat: -23.57, lon: -46.71 },
  { regiao: 'Santo Amaro', lat: -23.65, lon: -46.71 },
  { regiao: 'Grajaú', lat: -23.76, lon: -46.68 },
  { regiao: 'Parelheiros', lat: -23.83, lon: -46.73 },
  { regiao: 'Ipiranga', lat: -23.59, lon: -46.61 },
  { regiao: 'Penha', lat: -23.53, lon: -46.54 },
  { regiao: 'Itaquera', lat: -23.54, lon: -46.46 },
  { regiao: 'São Mateus', lat: -23.61, lon: -46.48 },
];

export type GradeClima = Pick<MapaCamadasResponse['clima'], 'horaPrevista' | 'pontos'>;

/** RN02: > 2,5 mm/h = Atenção; RN01: > 7,6 mm/h = Aguardar (B.8, comparação ">"). */
export function impactoChuva(mmH: number): ImpactoMapa {
  if (mmH > CHUVA_MODERADA_MAX_MM_H) return 'AGUARDAR';
  if (mmH > CHUVA_FRACA_MAX_MM_H) return 'ATENCAO';
  return 'NAO_PESA';
}

const LocalSchema = z.object({
  utc_offset_seconds: UtcOffsetSecondsSchema,
  current: z.object({
    time: OpenMeteoLocalTimeSchema,
    interval: z.number().int().positive(),
    temperature_2m: z.number(),
  }),
  hourly: z.object({
    time: z.array(OpenMeteoLocalTimeSchema),
    precipitation: z.array(z.number().nullable()),
    precipitation_probability: z.array(z.number().nullable()),
  }),
});

/** Com várias coordenadas a Open-Meteo devolve um array, na mesma ordem da URL. */
export const GradeResponseSchema = z.array(LocalSchema).length(PONTOS_GRADE.length);

export function montarUrlGrade(): string {
  const params = new URLSearchParams({
    latitude: PONTOS_GRADE.map((p) => p.lat.toFixed(2)).join(','),
    longitude: PONTOS_GRADE.map((p) => p.lon.toFixed(2)).join(','),
    current: 'temperature_2m',
    hourly: 'precipitation,precipitation_probability',
    timezone: OPEN_METEO_TIMEZONE,
    forecast_days: '2', // às 23h a próxima hora já é do dia seguinte
  });
  return `${OPEN_METEO_FORECAST_URL}?${params.toString()}`;
}

/** Próxima hora = [H, H+1], avaliada pelo carimbo H+1 (soma da hora anterior, B.8). */
export function mapearGrade(r: z.infer<typeof GradeResponseSchema>, agoraMs: number): ProviderResult<GradeClima> {
  let horaPrevista: string | null = null;
  const pontos = r.flatMap((local, i) => {
    const alvo = local.hourly.time.indexOf(inicioDaHora(local.current.time)) + 1;
    const mm = alvo > 0 ? local.hourly.precipitation[alvo] : null;
    if (mm == null) return []; // sem a hora na série: o ponto some (não inventa zero)
    horaPrevista ??= openMeteoTimeToIso(local.hourly.time[alvo]!, local.utc_offset_seconds);
    const prob = local.hourly.precipitation_probability[alvo];
    const p = PONTOS_GRADE[i]!;
    return [
      {
        regiao: p.regiao,
        lat: p.lat,
        lon: p.lon,
        temperaturaC: local.current.temperature_2m,
        chuvaProximaHoraMm: mm,
        probabilidadeChuva: prob == null ? null : Math.round(prob),
        impactoChuva: impactoChuva(mm),
      },
    ];
  });
  if (pontos.length === 0) {
    throw new SchemaValidationError([{ path: 'hourly.time', message: 'próxima hora ausente em todos os pontos' }], '');
  }
  const c = r[0]!;
  return {
    value: { horaPrevista, pontos },
    observedAt: fimDoIntervaloIso(c.current.time, c.utc_offset_seconds, c.current.interval, agoraMs),
  };
}

export class GradeClimaAdapter implements Provider<void, GradeClima> {
  readonly source = 'open-meteo'; // mesma fonte do clima: mesmo breaker e mesmas estatísticas
  readonly ttlSeconds = 15 * 60; // C.5
  readonly timeoutMs = 3_000; // C.5
  readonly refreshAhead = true;

  constructor(
    private readonly http: HttpClient = createHttpClient(),
    private readonly clock: Clock = systemClock,
  ) {}

  cacheKey(): string {
    return `grade-sp-${PONTOS_GRADE.length}`;
  }

  async fetch(_: void, ctx: ProviderFetchContext): Promise<ProviderResult<GradeClima>> {
    const r = await this.http.requestJson(montarUrlGrade(), GradeResponseSchema, {
      signal: ctx.signal,
      timeoutMs: ctx.timeoutMs ?? this.timeoutMs,
    });
    return mapearGrade(r, this.clock.now());
  }
}
