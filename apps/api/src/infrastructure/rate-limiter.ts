// Limitadores de taxa (T16, RNF03): fila serial com intervalo mínimo (OSRM/Nominatim ≤ 1 req/s)
// e janela deslizante (ARTESP ≤ 10 req/h, C.5)
import { setTimeout as delay } from 'node:timers/promises';
import { systemClock, type Clock } from './clock.js';
import { ProviderAbortedError, RateLimitedError } from './errors.js';

export interface RateLimiter {
  /** Resolve quando a chamada pode ser feita; lança RateLimitedError se não houver vaga. */
  acquire(signal?: AbortSignal): Promise<void>;
}

export type SleepFn = (ms: number, signal?: AbortSignal) => Promise<void>;

const defaultSleep: SleepFn = async (ms, signal) => {
  try {
    await delay(ms, undefined, { signal });
  } catch {
    throw new ProviderAbortedError('cancelado enquanto aguardava a vez na fila do limitador');
  }
};

export interface MinIntervalLimiterOptions {
  /** Intervalo mínimo entre o início de duas chamadas (ms). */
  intervalMs: number;
  clock?: Clock;
  sleep?: SleepFn;
}

/**
 * Fila serial: cada chamada recebe um horário reservado ≥ anterior + intervalo.
 * Uma vaga reservada e cancelada não é devolvida (erra para o lado seguro do limite).
 */
export class MinIntervalLimiter implements RateLimiter {
  private nextSlot = Number.NEGATIVE_INFINITY;
  private readonly intervalMs: number;
  private readonly clock: Clock;
  private readonly sleep: SleepFn;

  constructor(options: MinIntervalLimiterOptions) {
    this.intervalMs = options.intervalMs;
    this.clock = options.clock ?? systemClock;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw new ProviderAbortedError();
    const now = this.clock.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + this.intervalMs;
    const wait = slot - now;
    if (wait > 0) await this.sleep(wait, signal);
  }
}

export interface SlidingWindowLimiterOptions {
  maxRequests: number;
  windowMs: number;
  clock?: Clock;
}

/** Janela deslizante: no máximo `maxRequests` em qualquer intervalo de `windowMs`. Não espera; recusa. */
export class SlidingWindowLimiter implements RateLimiter {
  private readonly timestamps: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly clock: Clock;

  constructor(options: SlidingWindowLimiterOptions) {
    this.maxRequests = options.maxRequests;
    this.windowMs = options.windowMs;
    this.clock = options.clock ?? systemClock;
  }

  /** Quantas chamadas foram autorizadas na janela atual (para o contador de log do TC17). */
  get usedInWindow(): number {
    this.prune(this.clock.now());
    return this.timestamps.length;
  }

  tryAcquire(): boolean {
    const now = this.clock.now();
    this.prune(now);
    if (this.timestamps.length >= this.maxRequests) return false;
    this.timestamps.push(now);
    return true;
  }

  async acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw new ProviderAbortedError();
    if (!this.tryAcquire()) throw new RateLimitedError((this.timestamps[0] ?? this.clock.now()) + this.windowMs);
  }

  private prune(now: number): void {
    while (this.timestamps.length > 0 && now - this.timestamps[0]! >= this.windowMs) this.timestamps.shift();
  }
}

export interface LimiteCotaOptions {
  /** Intervalo mínimo entre chamadas (teto de QPS da fonte). */
  intervalMs: number;
  /** Cota da janela (ex.: por dia). */
  maxRequests: number;
  windowMs: number;
  clock?: Clock;
  sleep?: SleepFn;
}

/**
 * Cota de fonte com plano gratuito medido (TomTom): janela deslizante (recusa) + intervalo mínimo (espera) +
 * bloqueio até o `Retry-After` de um 429.
 * shortcut: a janela vive na memória do processo e zera a cada boot; com várias réplicas ou reinícios
 * frequentes, mova a contagem para o cache externo (Valkey, perfil sd-avancado).
 */
export class LimiteCota implements RateLimiter {
  private bloqueadoAte = 0;
  private readonly janela: SlidingWindowLimiter;
  private readonly intervalo: MinIntervalLimiter;
  private readonly clock: Clock;

  constructor(o: LimiteCotaOptions) {
    this.clock = o.clock ?? systemClock;
    this.janela = new SlidingWindowLimiter({ maxRequests: o.maxRequests, windowMs: o.windowMs, clock: this.clock });
    this.intervalo = new MinIntervalLimiter({ intervalMs: o.intervalMs, clock: this.clock, sleep: o.sleep });
  }

  get usadasNaJanela(): number {
    return this.janela.usedInWindow;
  }

  bloquearAte(ms: number): void {
    this.bloqueadoAte = Math.max(this.bloqueadoAte, ms);
  }

  async acquire(signal?: AbortSignal): Promise<void> {
    if (this.clock.now() < this.bloqueadoAte) throw new RateLimitedError(this.bloqueadoAte);
    await this.janela.acquire(signal);
    await this.intervalo.acquire(signal);
  }
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** Limites da tabela C.5. */
export const RATE_LIMITS = {
  /** OSRM e Nominatim: ≤ 1 req/s; usa 1,1 s de folga, como no spike T07. */
  umPorSegundoMs: 1_100,
  /** ARTESP: ≤ 10 req/h (abaixo do teto de 12). */
  artesp: { maxRequests: 10, windowMs: 60 * 60 * 1000 },
  /**
   * TomTom Routing (rotas de carro e a pé): plano gratuito = 20 000 req/mês (docs.tomtom.com/pricing, 13/10/2026)
   * → 20 000 / 31 dias = 645/dia; usamos 600/24 h. QPS padrão da Routing API = 5 → 1 chamada a cada 250 ms (4/s).
   */
  tomtomRotas: { intervalMs: 250, maxRequests: 600, windowMs: DIA_MS },
  /**
   * TomTom Traffic Flow raster tiles: 200 000 tiles/mês grátis → 6 451/dia; usamos 6 000/24 h.
   * QPS padrão "Traffic" = 10 → 1 tile a cada 125 ms (8/s).
   */
  tomtomTiles: { intervalMs: 125, maxRequests: 6_000, windowMs: DIA_MS },
} as const;
