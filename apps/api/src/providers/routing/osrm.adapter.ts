// Adaptador OSRM (T20, RF24, ADR-13): rota de carro origem→destino no servidor demo.
// Política do demo (spike T08): ≤ 1 req/s, User-Agent próprio, sem uso massivo. Quem garante o
// limite é o MinIntervalLimiter do ProviderRunner (chave = OSRM_SOURCE); aqui só se monta a chamada.
import type { LatLon } from '@kairos/contracts';
import { z } from 'zod';
import { createHttpClient, DEFAULT_TIMEOUT_MS, type HttpClient } from '../../infrastructure/http-client.js';
import type { Provider, ProviderFetchContext, ProviderResult } from '../../infrastructure/provider.js';

export const OSRM_SOURCE = 'osrm';
export const OSRM_BASE_URL_PADRAO = 'https://router.project-osrm.org';
/** C.5: 7 dias por par origem/destino. */
export const OSRM_TTL_SECONDS = 7 * 24 * 60 * 60;
/** 5 casas ≈ 1,1 m: a mesma origem/destino digitada de novo cai na mesma chave (spike T08). */
const CASAS_DECIMAIS = 5;

export interface RotaInput {
  origem: LatLon;
  destino: LatLon;
}

/** Coordenada [lon, lat], como em GeometrySchema.coordenadas. */
export type CoordenadaLonLat = [number, number];

export interface RotaOsrm {
  coordenadas: CoordenadaLonLat[];
  distanciaM: number;
  duracaoS: number;
}

const LonLatSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

/** Só os campos usados (fixture-route.json do spike T08); o resto da resposta é ignorado. */
export const OsrmRouteResponseSchema = z.object({
  code: z.literal('Ok'),
  routes: z
    .array(
      z.object({
        distance: z.number().nonnegative(),
        duration: z.number().nonnegative(),
        geometry: z.object({
          type: z.literal('LineString'),
          coordinates: z.array(LonLatSchema).min(2),
        }),
      }),
    )
    .min(1),
});

export type OsrmRouteResponse = z.infer<typeof OsrmRouteResponseSchema>;

export interface OsrmAdapterOptions {
  http?: HttpClient;
  baseUrl?: string;
  timeoutMs?: number;
}

function arredondar(valor: number): string {
  return valor.toFixed(CASAS_DECIMAIS);
}

/** "lon,lat" arredondado, no formato do path do OSRM. */
function ponto(p: LatLon): string {
  return `${arredondar(p.lon)},${arredondar(p.lat)}`;
}

export function mapearRotaOsrm(resposta: OsrmRouteResponse): RotaOsrm {
  const rota = resposta.routes[0]!;
  return {
    coordenadas: rota.geometry.coordinates.map(([lon, lat]) => [lon, lat]),
    distanciaM: rota.distance,
    duracaoS: rota.duration,
  };
}

export class OsrmAdapter implements Provider<RotaInput, RotaOsrm> {
  readonly source = OSRM_SOURCE;
  readonly ttlSeconds = OSRM_TTL_SECONDS;
  readonly timeoutMs: number;
  private readonly http: HttpClient;
  private readonly baseUrl: string;

  constructor(options: OsrmAdapterOptions = {}) {
    this.http = options.http ?? createHttpClient();
    this.baseUrl = (options.baseUrl ?? OSRM_BASE_URL_PADRAO).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  cacheKey(input: RotaInput): string {
    return `driving:${ponto(input.origem)};${ponto(input.destino)}`;
  }

  /** URL com as coordenadas arredondadas (as mesmas da chave de cache). */
  url(input: RotaInput): string {
    return `${this.baseUrl}/route/v1/driving/${ponto(input.origem)};${ponto(input.destino)}?overview=full&geometries=geojson`;
  }

  async fetch(input: RotaInput, ctx: ProviderFetchContext): Promise<ProviderResult<RotaOsrm>> {
    const resposta = await this.http.requestJson(this.url(input), OsrmRouteResponseSchema, {
      signal: ctx.signal,
      timeoutMs: this.timeoutMs,
    });
    return { value: mapearRotaOsrm(resposta) };
  }
}
