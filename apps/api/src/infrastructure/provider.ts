// Contrato dos adaptadores de provedor (T16). Implementado pelos adaptadores T17–T21 e executado
// pelo ProviderRunner (cache → breaker → limite de taxa → timeout → validação → envelope).
import {
  AirValueSchema,
  BusValueSchema,
  FloodValueSchema,
  RailValueSchema,
  TrafficValueSchema,
  WeatherValueSchema,
  type AirValue,
  type BusValue,
  type Dimension,
  type FloodValue,
  type Observation,
  type RailValue,
  type TrafficValue,
  type WeatherValue,
} from '@kairos/contracts';
import type { ZodType, ZodTypeDef } from 'zod';

export interface ProviderFetchContext {
  /** Abortado no timeout do provedor ou no prazo global do briefing. Repasse ao http-client. */
  signal: AbortSignal;
  /**
   * Prazo desta chamada definido pelo runner (o `timeoutMs` do provedor, ou um maior na renovação em
   * segundo plano). Repasse ao http-client; ausente = use o seu `timeoutMs`.
   */
  timeoutMs?: number;
}

export interface ProviderResult<TValue> {
  value: TValue;
  /**
   * Quando a fonte produziu o dado (ISO 8601). Se omitido, vale o instante da busca.
   * A idade usada em fresh/stale/unavailable (B.8) é contada a partir daqui.
   */
  observedAt?: string;
}

/** Provedor genérico (também serve a OSRM e Nominatim, que não são dimensões do briefing). */
export interface Provider<TInput, TValue> {
  /** Identificador da fonte no envelope e nos logs, ex.: "open-meteo", "sptrans-olhovivo". */
  readonly source: string;
  /** TTL do cache e base da regra de confiança (C.5). */
  readonly ttlSeconds: number;
  /** Timeout desta fonte (padrão 3 s, C.5). */
  readonly timeoutMs?: number;
  /**
   * Opta pela renovação antecipada em segundo plano (infrastructure/refresh-ahead.ts). Só para fontes
   * sem limite de taxa apertado (clima, ar, Metrô, alagamento); nunca Olho Vivo, OSRM ou Nominatim.
   */
  readonly refreshAhead?: boolean;
  /** Chave de cache estável para a entrada (o runner prefixa com `source`). */
  cacheKey(input: TInput): string;
  /** Chama a fonte e devolve o valor já validado por Zod (lança ProviderError em falha). */
  fetch(input: TInput, ctx: ProviderFetchContext): Promise<ProviderResult<TValue>>;
}

export interface DimensionValueMap {
  weather: WeatherValue;
  air: AirValue;
  bus: BusValue;
  rail: RailValue;
  flood: FloodValue;
  traffic: TrafficValue;
}

export type DimensionValue<D extends Dimension> = DimensionValueMap[D];
export type ObservationOf<D extends Dimension> = Extract<Observation, { dimension: D }>;

/** Provedor de uma dimensão do briefing: produz uma Observation do contrato (RF12). */
export interface DimensionProvider<TInput, D extends Dimension> extends Provider<TInput, DimensionValue<D>> {
  readonly dimension: D;
}

/** Schemas do contrato por dimensão: o runner revalida o valor antes de gravar no cache. */
export const DIMENSION_VALUE_SCHEMAS: { [D in Dimension]: ZodType<DimensionValue<D>, ZodTypeDef, unknown> } = {
  weather: WeatherValueSchema,
  air: AirValueSchema,
  bus: BusValueSchema,
  rail: RailValueSchema,
  flood: FloodValueSchema,
  traffic: TrafficValueSchema,
};
