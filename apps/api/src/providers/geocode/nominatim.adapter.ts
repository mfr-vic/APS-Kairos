// Adaptador Nominatim (T20, RF01, ADR-15): busca de endereço limitada a São Paulo.
// Política da OSMF (spike T08): ≤ 1 req/s, User-Agent próprio, cache obrigatório, sem autocomplete
// e atribuição "© OpenStreetMap". O limite vem do MinIntervalLimiter do ProviderRunner
// (chave = NOMINATIM_SOURCE) e o cache de 30 dias, do próprio runner.
import type { GeocodeResponse } from '@kairos/contracts';
import { z } from 'zod';
import { createHttpClient, DEFAULT_TIMEOUT_MS, type HttpClient } from '../../infrastructure/http-client.js';
import type { Provider, ProviderFetchContext, ProviderResult } from '../../infrastructure/provider.js';

export const NOMINATIM_SOURCE = 'nominatim';
export const NOMINATIM_BASE_URL_PADRAO = 'https://nominatim.openstreetmap.org';
/** C.5: 30 dias. */
export const NOMINATIM_TTL_SECONDS = 30 * 24 * 60 * 60;
/** Caixa do município de São Paulo usada no spike T08 (lon1,lat1,lon2,lat2), com bounded=1. */
export const VIEWBOX_SAO_PAULO = '-46.83,-23.35,-46.36,-24.01';
const LIMITE_RESULTADOS = 5;

/** lat/lon chegam como string no Nominatim (spike T08). */
const coordenada = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .transform(Number)
    .pipe(z.number().finite().min(min).max(max));

/** Só os campos usados (fixture-geocode.json do spike T08); o resto é ignorado. */
export const NominatimSearchResponseSchema = z.array(
  z.object({
    lat: coordenada(-90, 90),
    lon: coordenada(-180, 180),
    display_name: z.string().min(1),
  }),
);

export type NominatimSearchResponse = z.infer<typeof NominatimSearchResponseSchema>;

/** Chave de cache e texto enviado: sem espaços nas pontas e sem espaços repetidos. */
export function normalizarConsulta(q: string): string {
  return q.trim().replace(/\s+/g, ' ');
}

/**
 * Rótulo legível: o display_name sem os trechos que não ajudam a escolher o endereço
 * ("Região Sudeste", "Brasil"). Ex.: "Museu de Arte de São Paulo, 1578, Avenida Paulista,
 * Cerqueira César, Bela Vista, São Paulo, 01310-200".
 */
export function rotuloLegivel(displayName: string): string {
  const partes = displayName
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && p !== 'Brasil' && !/^Região /.test(p));
  return partes.length > 0 ? partes.join(', ') : displayName.trim();
}

export function mapearBuscaNominatim(resposta: NominatimSearchResponse): GeocodeResponse {
  return {
    resultados: resposta.map((r) => ({ lat: r.lat, lon: r.lon, rotulo: rotuloLegivel(r.display_name) })),
  };
}

export interface NominatimAdapterOptions {
  http?: HttpClient;
  baseUrl?: string;
  timeoutMs?: number;
}

export class NominatimAdapter implements Provider<string, GeocodeResponse> {
  readonly source = NOMINATIM_SOURCE;
  readonly ttlSeconds = NOMINATIM_TTL_SECONDS;
  readonly timeoutMs: number;
  private readonly http: HttpClient;
  private readonly baseUrl: string;

  constructor(options: NominatimAdapterOptions = {}) {
    this.http = options.http ?? createHttpClient();
    this.baseUrl = (options.baseUrl ?? NOMINATIM_BASE_URL_PADRAO).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Mesma consulta com caixa ou espaços diferentes → mesma chave (a fonte bloqueia repetições). */
  cacheKey(q: string): string {
    return normalizarConsulta(q).toLowerCase();
  }

  url(q: string): string {
    const params = new URLSearchParams({
      format: 'jsonv2',
      q: normalizarConsulta(q),
      countrycodes: 'br',
      viewbox: VIEWBOX_SAO_PAULO,
      bounded: '1',
      limit: String(LIMITE_RESULTADOS),
    });
    return `${this.baseUrl}/search?${params.toString()}`;
  }

  async fetch(q: string, ctx: ProviderFetchContext): Promise<ProviderResult<GeocodeResponse>> {
    const resposta = await this.http.requestJson(this.url(q), NominatimSearchResponseSchema, {
      signal: ctx.signal,
      timeoutMs: this.timeoutMs,
      headers: { 'Accept-Language': 'pt-BR' },
    });
    return { value: mapearBuscaNominatim(resposta) };
  }
}
