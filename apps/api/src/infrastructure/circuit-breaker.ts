// Circuit breaker (T16, RF15, C.5): abre após 3 falhas consecutivas e fica aberto por 60 s
import { systemClock, type Clock } from './clock.js';
import { CircuitOpenError } from './errors.js';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  openDurationMs?: number;
  clock?: Clock;
}

export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly openDurationMs: number;
  private readonly clock: Clock;
  private consecutiveFailures = 0;
  private openedAt: number | null = null;
  private trialInFlight = false;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.openDurationMs = options.openDurationMs ?? 60_000;
    this.clock = options.clock ?? systemClock;
  }

  /** closed → open (após o limiar) → half-open (após 60 s) → closed (sucesso) ou open (falha). */
  get state(): CircuitState {
    if (this.openedAt === null) return 'closed';
    return this.clock.now() - this.openedAt >= this.openDurationMs ? 'half-open' : 'open';
  }

  /** Quando o circuito volta a aceitar uma tentativa (ms), ou null se fechado. */
  get retryAt(): number | null {
    return this.openedAt === null ? null : this.openedAt + this.openDurationMs;
  }

  /**
   * Reserva a passagem de uma chamada. Em meia-abertura, só uma chamada de teste passa por vez.
   * Lança CircuitOpenError se a chamada não deve ser feita.
   */
  acquire(): void {
    const state = this.state;
    if (state === 'closed') return;
    if (state === 'half-open' && !this.trialInFlight) {
      this.trialInFlight = true;
      return;
    }
    throw new CircuitOpenError(this.retryAt ?? this.clock.now());
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.openedAt = null;
    this.trialInFlight = false;
  }

  recordFailure(): void {
    this.trialInFlight = false;
    if (this.openedAt !== null) {
      // Falhou a chamada de teste (ou uma que já estava em voo): reabre por mais 60 s
      this.openedAt = this.clock.now();
      return;
    }
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold) this.openedAt = this.clock.now();
  }

  /** Libera a reserva sem contar sucesso nem falha (ex.: chamada cancelada pelo prazo global). */
  release(): void {
    this.trialInFlight = false;
  }

  /** Executa `fn` protegida pelo breaker. `isFailure` decide o que conta como falha (padrão: qualquer erro). */
  async execute<T>(fn: () => Promise<T>, isFailure: (err: unknown) => boolean = () => true): Promise<T> {
    this.acquire();
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      if (isFailure(err)) this.recordFailure();
      else this.release();
      throw err;
    }
  }
}
