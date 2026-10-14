// Adaptador TomTom Routing API v1 `calculateRoute` (RF22 reaberto e RF24, decisão do usuário de 14/10/2026):
// rota de carro com trânsito ao vivo (geometria + dimensão `traffic` do briefing, numa só chamada) e rota a pé
// (GET /v1/rota). Doc: docs.tomtom.com/routing-api/documentation/tomtom-maps/calculate-route (13/10/2026).
// ADR-14 eliminava a TomTom por R1 (serviço comercial/proprietário); o usuário revogou em 14/10/2026 porque a
// "linha reta" como rota era inviável — a TomTom tem perfil a pé e trânsito, que o OSRM público não tem.
//
// A chave vai na QUERY STRING (`key=`), então toda URL desta fonte é segredo: nenhum erro que sai daqui leva a
// URL ou a chave (mascararChave); o HttpStatusError é recriado com a URL mascarada.
import type { LatLon, ModoRota } from '@kairos/contracts';
import { z } from 'zod';
import { systemClock, type Clock } from '../../infrastructure/clock.js';
import { HttpStatusError, ProviderNetworkError, RateLimitedError, SchemaValidationError } from '../../infrastructure/errors.js';
import { createHttpClient, type HttpClient } from '../../infrastructure/http-client.js';
import type { Provider, ProviderFetchContext, ProviderResult } from '../../infrastructure/provider.js';
import { LimiteCota, RATE_LIMITS } from '../../infrastructure/rate-limiter.js';
import type { CoordenadaLonLat, RotaInput } from './osrm.adapter.js';

export const TOMTOM_SOURCE = 'tomtom';
export const TOMTOM_BASE_URL = 'https://api.tomtom.com';
/** Trânsito muda rápido: 5 min por par origem/destino (C.5). */
export const TOMTOM_TTL_CARRO_S = 5 * 60;
/** Rota a pé não depende de trânsito: 1 dia (C.5). */
export const TOMTOM_TTL_A_PE_S = 24 * 60 * 60;
export const TOMTOM_TIMEOUT_MS = 3_000;
/** 4 casas ≈ 11 m: a mesma origem/destino cai na mesma chave de cache (e na mesma URL). */
const CASAS_DECIMAIS = 4;
/** Sem `Retry-After` legível num 429: espera conservadora. */
export const TOMTOM_RETRY_AFTER_PADRAO_S = 60;
export const ATRIBUICAO_TOMTOM = '© TomTom';

export interface TrechoLento {
  atrasoS: number;
  comprimentoM: number;
  /** magnitudeOfDelay: 0 desconhecido, 1 leve, 2 moderado, 3 intenso, 4 indefinido (via fechada). */
  magnitude: number;
}

export interface RotaTomTom {
  coordenadas: CoordenadaLonLat[];
  distanciaM: number;
  /** Com o trânsito de agora (travelTimeInSeconds). */
  duracaoS: number;
  /** Sem trânsito (noTrafficTravelTimeInSeconds); null se a fonte não informar. */
  duracaoLivreS: number | null;
  atrasoS: number;
  /** Seções `TRAFFIC`, do maior atraso para o menor. */
  trechosLentos: TrechoLento[];
}

const PontoSchema = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });

/** Só os campos usados; a doc pede para ignorar campos desconhecidos. */
export const TomTomRouteResponseSchema = z.object({
  routes: z
    .array(
      z.object({
        summary: z.object({
          lengthInMeters: z.number().nonnegative(),
          travelTimeInSeconds: z.number().nonnegative(),
          trafficDelayInSeconds: z.number().nonnegative().optional(),
          noTrafficTravelTimeInSeconds: z.number().nonnegative().optional(),
        }),
        legs: z.array(z.object({ points: z.array(PontoSchema) })).min(1),
        sections: z
          .array(
            z.object({
              sectionType: z.string(),
              startPointIndex: z.number().int().nonnegative(),
              endPointIndex: z.number().int().nonnegative(),
              delayInSeconds: z.number().nonnegative().optional(),
              magnitudeOfDelay: z.number().int().min(0).max(4).optional(),
            }),
          )
          .optional(),
      }),
    )
    .min(1),
});

export type TomTomRouteResponse = z.infer<typeof TomTomRouteResponseSchema>;

const RAIO_TERRA_M = 6_371_000;

/** Distância em metros entre dois pontos [lon, lat] (haversine). */
export function distanciaM([lon1, lat1]: CoordenadaLonLat, [lon2, lat2]: CoordenadaLonLat): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * RAIO_TERRA_M * Math.asin(Math.sqrt(a));
}

function comprimento(coordenadas: readonly CoordenadaLonLat[], inicio: number, fim: number): number {
  let total = 0;
  for (let i = Math.max(0, inicio); i < Math.min(fim, coordenadas.length - 1); i++) {
    total += distanciaM(coordenadas[i]!, coordenadas[i + 1]!);
  }
  return Math.round(total);
}

export function mapearRotaTomTom(resposta: TomTomRouteResponse): RotaTomTom {
  const rota = resposta.routes[0]!;
  const coordenadas = rota.legs.flatMap((leg) => leg.points.map((p): CoordenadaLonLat => [p.longitude, p.latitude]));
  if (coordenadas.length < 2) {
    throw new SchemaValidationError([{ path: 'routes.0.legs', message: 'rota com menos de 2 pontos' }], String(coordenadas.length));
  }
  const trechosLentos = (rota.sections ?? [])
    .filter((s) => s.sectionType === 'TRAFFIC')
    .map((s) => ({
      atrasoS: Math.round(s.delayInSeconds ?? 0),
      comprimentoM: comprimento(coordenadas, s.startPointIndex, s.endPointIndex),
      magnitude: s.magnitudeOfDelay ?? 0,
    }))
    .sort((a, b) => b.atrasoS - a.atrasoS);
  const s = rota.summary;
  return {
    coordenadas,
    distanciaM: s.lengthInMeters,
    duracaoS: Math.round(s.travelTimeInSeconds),
    duracaoLivreS: s.noTrafficTravelTimeInSeconds === undefined ? null : Math.round(s.noTrafficTravelTimeInSeconds),
    atrasoS: Math.round(s.trafficDelayInSeconds ?? 0),
    trechosLentos,
  };
}

/** Troca a chave (crua e codificada) por "***" em qualquer texto que possa ir para log ou resposta. */
export function mascararChave(texto: string, chave: string): string {
  if (!chave) return texto;
  return texto.split(chave).join('***').split(encodeURIComponent(chave)).join('***');
}

/** `Retry-After` em segundos ou data HTTP → ms de espera. */
export function esperaRetryAfterMs(valor: string | null | undefined, agora: number, padraoS: number): number {
  if (valor) {
    const s = Number(valor);
    if (Number.isFinite(s) && s >= 0) return s * 1000;
    const data = Date.parse(valor);
    if (!Number.isNaN(data)) return Math.max(0, data - agora);
  }
  return padraoS * 1000;
}

/**
 * Erro da TomTom → erro do runner sem URL/chave, com motivo humano. 429 bloqueia o limitador até o
 * `Retry-After` e vira RateLimitedError (não conta no breaker).
 */
export function erroTomTom(err: unknown, chave: string, limiter: LimiteCota, clock: Clock): unknown {
  if (err instanceof HttpStatusError) {
    if (err.status === 429) {
      const ate = clock.now() + esperaRetryAfterMs(err.extra.retryAfter, clock.now(), TOMTOM_RETRY_AFTER_PADRAO_S);
      limiter.bloquearAte(ate);
      return new RateLimitedError(ate);
    }
    const motivo =
      err.status === 401 || err.status === 403
        ? `TomTom recusou a chave (HTTP ${err.status})`
        : err.status === 400
          ? 'TomTom não encontrou rota entre os pontos (HTTP 400)'
          : err.status >= 500
            ? `TomTom fora do ar (HTTP ${err.status})`
            : undefined;
    return new HttpStatusError(err.status, mascararChave(err.url, chave), mascararChave(err.trecho, chave), {
      retryAfter: err.extra.retryAfter,
      ...(motivo ? { motivo } : {}),
    });
  }
  if (err instanceof ProviderNetworkError) return new ProviderNetworkError(mascararChave(err.message, chave));
  return err;
}

export interface TomTomRotasOptions {
  /** TOMTOM_KEY (obrigatória: sem chave os provedores não são criados). */
  chave: string;
  http?: HttpClient;
  clock?: Clock;
  baseUrl?: string;
  timeoutMs?: number;
}

export type TomTomRotaProvider = Provider<RotaInput, RotaTomTom>;

export interface TomTomRotas {
  carro: TomTomRotaProvider;
  aPe: TomTomRotaProvider;
  /** Registrar no runner como `rateLimiters[TOMTOM_SOURCE]` (compartilhado pelos dois modos). */
  limiter: LimiteCota;
}

function ponto(p: LatLon): string {
  return `${p.lat.toFixed(CASAS_DECIMAIS)},${p.lon.toFixed(CASAS_DECIMAIS)}`;
}

/** Os dois modos usam o mesmo `source`: breaker, estatísticas e cota da credencial são um só. */
export function createTomTomRotas(options: TomTomRotasOptions): TomTomRotas {
  const http = options.http ?? createHttpClient();
  const clock = options.clock ?? systemClock;
  const baseUrl = (options.baseUrl ?? TOMTOM_BASE_URL).replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs ?? TOMTOM_TIMEOUT_MS;
  const limiter = new LimiteCota({ ...RATE_LIMITS.tomtomRotas, clock });
  const chave = options.chave;

  function criar(modo: ModoRota): TomTomRotaProvider {
    const parametros =
      modo === 'carro'
        ? 'travelMode=car&traffic=true&routeType=fastest&computeTravelTimeFor=all&sectionType=traffic'
        : 'travelMode=pedestrian&routeType=fastest&computeTravelTimeFor=all';
    return {
      source: TOMTOM_SOURCE,
      ttlSeconds: modo === 'carro' ? TOMTOM_TTL_CARRO_S : TOMTOM_TTL_A_PE_S,
      timeoutMs,
      cacheKey: ({ origem, destino }) => `${modo}:${ponto(origem)}:${ponto(destino)}`,
      async fetch({ origem, destino }: RotaInput, ctx: ProviderFetchContext): Promise<ProviderResult<RotaTomTom>> {
        const url = `${baseUrl}/routing/1/calculateRoute/${ponto(origem)}:${ponto(destino)}/json?key=${encodeURIComponent(chave)}&${parametros}`;
        try {
          const resposta = await http.requestJson(url, TomTomRouteResponseSchema, {
            signal: ctx.signal,
            timeoutMs: ctx.timeoutMs ?? timeoutMs,
          });
          return { value: mapearRotaTomTom(resposta) };
        } catch (err) {
          throw erroTomTom(err, chave, limiter, clock);
        }
      },
    };
  }

  return { carro: criar('carro'), aPe: criar('a-pe'), limiter };
}
