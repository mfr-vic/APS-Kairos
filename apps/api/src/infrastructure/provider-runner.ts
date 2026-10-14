// Executor de provedores (T16, RF12, RF15, RF16, RNF09):
// cache → circuit breaker → limite de taxa → timeout → validação → envelope fresh/stale/unavailable (B.8)
import { DateTimeSchema, type DataState, type Dimension } from '@kairos/contracts';
import type { CachePort } from './cache/cache.port.js';
import type { CoordenacaoCache } from './cache/valkey-cache.js';
import { CircuitBreaker, type CircuitBreakerOptions, type CircuitState } from './circuit-breaker.js';
import { systemClock, type Clock } from './clock.js';
import {
  HttpStatusError,
  InvalidJsonError,
  ProviderAbortedError,
  ProviderTimeoutError,
  SchemaValidationError,
  motivoDoErro,
  toProviderError,
  type ProviderError,
  type ProviderErrorKind,
} from './errors.js';
import { DEFAULT_TIMEOUT_MS, parseWithSchema } from './http-client.js';
import { DIMENSION_VALUE_SCHEMAS, type DimensionProvider, type ObservationOf, type Provider } from './provider.js';
import type { ZodType, ZodTypeDef } from 'zod';
import type { RateLimiter } from './rate-limiter.js';
import { RefreshAhead, type RefreshAheadOptions } from './refresh-ahead.js';

/** Subconjunto do logger do Fastify/pino usado aqui; `request.log` serve (leva o requestId). */
export interface ProviderLogger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
}

/** hit = cache dentro do TTL; miss = buscou na fonte; stale = fonte falhou e usou cache vencido. */
export type CacheStatus = 'hit' | 'miss' | 'stale';

interface OutcomeBase {
  cache: CacheStatus;
  latencyMs: number;
  /** Tipo do erro da fonte, quando houve. */
  erro?: ProviderErrorKind;
}

export type ProviderOutcome<T> =
  | (OutcomeBase & {
      status: 'fresh' | 'stale';
      value: T;
      observedAt: string;
      fetchedAt: string;
      ageSeconds: number;
      motivo?: string;
    })
  | (OutcomeBase & {
      status: 'unavailable';
      value: null;
      observedAt: string | null;
      fetchedAt: string | null;
      ageSeconds: number | null;
      motivo: string;
    });

export interface ProviderRunnerOptions {
  cache: CachePort;
  clock?: Clock;
  /** Limitadores compartilhados por fonte (chave = `source`), ex.: { nominatim: new MinIntervalLimiter(...) }. */
  rateLimiters?: Record<string, RateLimiter>;
  /** Padrão C.5: 3 falhas consecutivas, 60 s aberto. */
  breaker?: Omit<CircuitBreakerOptions, 'clock'>;
  /** Limite de stale em múltiplos do TTL (B.8: 3). */
  staleFactor?: number;
  /**
   * Liga a renovação antecipada dos provedores com `refreshAhead: true` (refresh-ahead.ts).
   * Ausente = desligada (padrão dos testes). O timer só corre após `startBackground()`.
   */
  refreshAhead?: Omit<RefreshAheadOptions, 'clock' | 'storedAt'>;
  /**
   * Cache compartilhado com o worker (RF27, valkey-cache.ts): registra as chaves pedidas dos provedores
   * com `refreshAhead` para o worker renová-las, e toma o lock da chave antes de ir à fonte num miss.
   */
  coordenacao?: CoordenacaoCache;
}

/** Duração do lock de uma chave: cobre a renovação mais longa (15 s) com folga; expira sozinho. */
export const LOCK_RENOVACAO_MS = 20_000;

export interface RefreshOptions {
  /** Prazo desta chamada (ex.: 15 s em segundo plano), no lugar do `timeoutMs` do provedor. */
  timeoutMs: number;
  signal?: AbortSignal;
  /** Padrão: o schema do contrato, se o provedor for de dimensão. */
  validate?: (value: unknown) => unknown;
}

export interface RunOptions {
  logger: ProviderLogger;
  /** Prazo global do briefing (C.5: 4 s), ex.: AbortSignal.timeout(4000). */
  signal?: AbortSignal;
}

export interface ProviderHealth {
  source: string;
  breaker: CircuitState;
  lastSuccessAt: string | null;
  lastLatencyMs: number | null;
  lastError: ProviderErrorKind | null;
  /** Chamadas REAIS à fonte desde que a API subiu (cache hit, breaker aberto e limite de taxa não contam). */
  requestCount: number;
  successCount: number;
  /** Média de latência das chamadas com sucesso; null sem sucesso. */
  avgLatencyMs: number | null;
}

interface ProviderStats extends Omit<ProviderHealth, 'source' | 'breaker' | 'avgLatencyMs'> {
  successLatencySumMs: number;
}

const STATS_INICIAIS: ProviderStats = {
  lastSuccessAt: null,
  lastLatencyMs: null,
  lastError: null,
  requestCount: 0,
  successCount: 0,
  successLatencySumMs: 0,
};

interface CachedRecord<T> {
  value: T;
  observedAt: string;
  fetchedAt: string;
}

/** fresh se idade ≤ TTL; stale se ≤ fator×TTL; unavailable acima disso (B.8). */
export function classifyAge(ageSeconds: number, ttlSeconds: number, staleFactor = 3): DataState {
  if (ageSeconds <= ttlSeconds) return 'fresh';
  if (ageSeconds <= ttlSeconds * staleFactor) return 'stale';
  return 'unavailable';
}

/** Provedor de dimensão → valida pelo schema do contrato antes de gravar no cache. */
function validatorFor(provider: object): ((value: unknown) => unknown) | undefined {
  if (!('dimension' in provider)) return undefined;
  const schema: ZodType<unknown, ZodTypeDef, unknown> | undefined = DIMENSION_VALUE_SCHEMAS[provider.dimension as Dimension];
  return schema ? (v) => parseWithSchema(schema, v) : undefined;
}

function minutos(ageSeconds: number): string {
  const min = Math.round(ageSeconds / 60);
  return min < 1 ? 'menos de 1 min' : `${min} min`;
}

export class ProviderRunner {
  private readonly cache: CachePort;
  private readonly clock: Clock;
  private readonly rateLimiters: Record<string, RateLimiter>;
  private readonly breakerOptions: Omit<CircuitBreakerOptions, 'clock'>;
  private readonly staleFactor: number;
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly stats = new Map<string, ProviderStats>();
  /** Renovação antecipada (null = desligada). */
  readonly refreshAhead: RefreshAhead | null;
  private readonly coordenacao: CoordenacaoCache | undefined;

  constructor(options: ProviderRunnerOptions) {
    this.cache = options.cache;
    this.coordenacao = options.coordenacao;
    this.clock = options.clock ?? systemClock;
    this.rateLimiters = options.rateLimiters ?? {};
    this.breakerOptions = options.breaker ?? {};
    this.staleFactor = options.staleFactor ?? 3;
    this.refreshAhead = options.refreshAhead
      ? new RefreshAhead({
          ...options.refreshAhead,
          clock: this.clock,
          storedAt: async (key) => (await this.cache.getStale(key))?.storedAt,
        })
      : null;
  }

  /** Liga o timer da renovação antecipada (no boot do servidor). */
  startBackground(): void {
    this.refreshAhead?.start();
  }

  /** Para o timer e aborta renovações em voo (no close do app). */
  stopBackground(): void {
    this.refreshAhead?.stop();
  }

  /**
   * Busca na fonte agora e grava no cache, com prazo próprio, fora do prazo do briefing (aquecimento no
   * boot e renovação antecipada). Passa pelo breaker e pelos limitadores. Lança em falha (quem chama loga);
   * o cache anterior não é apagado.
   */
  async refresh<TInput, TValue>(provider: Provider<TInput, TValue>, input: TInput, opts: RefreshOptions): Promise<void> {
    const validate = (opts.validate ?? validatorFor(provider)) as ((v: TValue) => TValue) | undefined;
    const record = await this.callSource(provider, input, opts.signal, validate, opts.timeoutMs);
    await this.cache.set(`${provider.source}:${provider.cacheKey(input)}`, record, provider.ttlSeconds);
  }

  /** Um breaker por fonte, compartilhado entre requisições. */
  breakerFor(source: string): CircuitBreaker {
    let breaker = this.breakers.get(source);
    if (!breaker) {
      breaker = new CircuitBreaker({ ...this.breakerOptions, clock: this.clock });
      this.breakers.set(source, breaker);
    }
    return breaker;
  }

  /** Estado observado das fontes já chamadas (base para /v1/health/providers, T28). */
  health(): ProviderHealth[] {
    return [...this.breakers.entries()].map(([source, breaker]) => {
      const { successLatencySumMs, ...stats } = this.stats.get(source) ?? STATS_INICIAIS;
      return {
        source,
        breaker: breaker.state,
        ...stats,
        avgLatencyMs: stats.successCount ? Math.round(successLatencySumMs / stats.successCount) : null,
      };
    });
  }

  /** Executa um provedor de dimensão e devolve a Observation do contrato (RF12). Não lança por falha da fonte. */
  async observe<TInput, D extends Dimension>(
    provider: DimensionProvider<TInput, D>,
    input: TInput,
    opts: RunOptions,
  ): Promise<ObservationOf<D>> {
    const schema = DIMENSION_VALUE_SCHEMAS[provider.dimension];
    const outcome = await this.execute(provider, input, opts, (v) => parseWithSchema(schema, v), provider.dimension);
    const observation = {
      dimension: provider.dimension,
      source: provider.source,
      status: outcome.status,
      observedAt: outcome.observedAt,
      fetchedAt: outcome.fetchedAt,
      ttlSeconds: provider.ttlSeconds,
      value: outcome.value,
      ...(outcome.motivo ? { motivo: outcome.motivo } : {}),
    };
    return observation as unknown as ObservationOf<D>;
  }

  /**
   * Executa qualquer provedor (inclusive OSRM/Nominatim) e devolve o resultado com estado e idade.
   * `validate` revalida o valor antes de ir para o cache; erro nela conta como falha (C.5).
   * Não lança por falha da fonte: o erro vira `unavailable` (ou `stale`, se houver cache vencido).
   */
  async execute<TInput, TValue>(
    provider: Provider<TInput, TValue>,
    input: TInput,
    opts: RunOptions,
    validate?: (value: TValue) => TValue,
    dimension?: Dimension,
  ): Promise<ProviderOutcome<TValue>> {
    const start = this.clock.now();
    const key = `${provider.source}:${provider.cacheKey(input)}`;
    const base = { provider: provider.source, ...(dimension ? { dimension } : {}) };

    // Renovação antecipada: lembra a chave pedida e, ao responder, renova em segundo plano se ela já
    // estiver perto de vencer, vencida ou ausente (stale-while-revalidate; ver refresh-ahead.ts)
    const refreshAhead = provider.refreshAhead ? this.refreshAhead : null;
    refreshAhead?.track({
      key,
      source: provider.source,
      ttlSeconds: provider.ttlSeconds,
      run: ({ signal, timeoutMs }) => this.refresh(provider, input, { signal, timeoutMs, validate: validate as RefreshOptions['validate'] }),
    });

    // Com cache compartilhado, quem renova é o worker: a chave é registrada depois de gravada no cache,
    // para o worker não achá-la ausente e chamar a fonte junto com esta requisição
    const coordenacao = provider.refreshAhead ? this.coordenacao : undefined;

    const finish = (outcome: ProviderOutcome<TValue>) => {
      if (refreshAhead) void refreshAhead.refreshIfDue(key);
      coordenacao?.registrarQuente({ key, source: provider.source, ttlSeconds: provider.ttlSeconds, input });
      opts.logger.info(
        {
          ...base,
          status: outcome.status,
          cache: outcome.cache,
          latencyMs: outcome.latencyMs,
          ageSeconds: outcome.ageSeconds === null ? null : Math.round(outcome.ageSeconds),
          ...(outcome.erro ? { erro: outcome.erro } : {}),
          ...(outcome.motivo ? { motivo: outcome.motivo } : {}),
        },
        'provider',
      );
      return outcome;
    };

    const hit = await this.cache.get<CachedRecord<TValue>>(key);
    if (hit) return finish(this.fromRecord(hit.value, provider.ttlSeconds, 'hit', start));

    let error: ProviderError;
    try {
      // Avisa o worker que esta chave está sendo buscada; a requisição do usuário nunca espera o lock
      if (coordenacao) await coordenacao.tentarLock(key, LOCK_RENOVACAO_MS);
      const record = await this.callSource(provider, input, opts.signal, validate);
      await this.cache.set(key, record, provider.ttlSeconds);
      return finish(this.fromRecord(record, provider.ttlSeconds, 'miss', start));
    } catch (err) {
      error = toProviderError(err);
    }

    opts.logger.warn({ ...base, ...this.errorDetails(error) }, 'falha no provedor');
    this.updateStats(provider.source, { lastError: error.kind });

    const stale = await this.cache.getStale<CachedRecord<TValue>>(key);
    if (stale) {
      return finish(this.fromRecord(stale.value, provider.ttlSeconds, 'stale', start, error));
    }
    return finish({
      status: 'unavailable',
      value: null,
      observedAt: null,
      fetchedAt: null,
      ageSeconds: null,
      motivo: motivoDoErro(error),
      cache: 'miss',
      latencyMs: this.clock.now() - start,
      erro: error.kind,
    });
  }

  private async callSource<TInput, TValue>(
    provider: Provider<TInput, TValue>,
    input: TInput,
    external: AbortSignal | undefined,
    validate?: (value: TValue) => TValue,
    timeoutOverrideMs?: number,
  ): Promise<CachedRecord<TValue>> {
    const breaker = this.breakerFor(provider.source);
    breaker.acquire(); // lança CircuitOpenError sem chamar a fonte

    const timeoutMs = timeoutOverrideMs ?? provider.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onExternalAbort = () => controller.abort();
    external?.addEventListener('abort', onExternalAbort, { once: true });

    try {
      if (external?.aborted) throw new ProviderAbortedError();
      await this.rateLimiters[provider.source]?.acquire(external);

      const callStart = this.clock.now();
      this.updateStats(provider.source, (s) => ({ requestCount: s.requestCount + 1 }));
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);

      // A corrida garante o timeout mesmo que o adaptador ignore o signal
      const aborted = new Promise<never>((_, reject) => {
        const rejectNow = () => reject(timedOut ? new ProviderTimeoutError(timeoutMs) : new ProviderAbortedError());
        if (controller.signal.aborted) rejectNow();
        else controller.signal.addEventListener('abort', rejectNow, { once: true });
      });
      aborted.catch(() => undefined);
      const result = await Promise.race([provider.fetch(input, { signal: controller.signal, timeoutMs }), aborted]);

      const value = validate ? validate(result.value) : result.value;
      const fetchedAt = new Date(this.clock.now()).toISOString();
      let observedAt = fetchedAt;
      if (result.observedAt !== undefined) {
        const parsed = DateTimeSchema.safeParse(result.observedAt);
        if (!parsed.success) {
          throw new SchemaValidationError(
            [{ path: 'observedAt', message: 'data/hora ISO 8601 com fuso inválida' }],
            String(result.observedAt),
          );
        }
        observedAt = parsed.data;
      }

      breaker.recordSuccess();
      const latencyMs = this.clock.now() - callStart;
      this.updateStats(provider.source, (s) => ({
        lastSuccessAt: fetchedAt,
        lastLatencyMs: latencyMs,
        lastError: null,
        successCount: s.successCount + 1,
        successLatencySumMs: s.successLatencySumMs + latencyMs,
      }));
      return { value, observedAt, fetchedAt };
    } catch (err) {
      const providerError = toProviderError(err);
      if (providerError.kind === 'circuit-open') throw providerError;
      if (providerError.countsAsFailure) breaker.recordFailure();
      else breaker.release();
      throw providerError;
    } finally {
      clearTimeout(timer);
      external?.removeEventListener('abort', onExternalAbort);
    }
  }

  private fromRecord<TValue>(
    record: CachedRecord<TValue>,
    ttlSeconds: number,
    cache: CacheStatus,
    start: number,
    error?: ProviderError,
  ): ProviderOutcome<TValue> {
    const now = this.clock.now();
    const ageSeconds = Math.max(0, (now - Date.parse(record.observedAt)) / 1000);
    let status = classifyAge(ageSeconds, ttlSeconds, this.staleFactor);
    // Cache vencido nunca é apresentado como fresh
    if (cache === 'stale' && status === 'fresh') status = 'stale';
    const latencyMs = now - start;
    const erro = error?.kind;

    if (status === 'unavailable') {
      return {
        status,
        value: null,
        observedAt: record.observedAt,
        fetchedAt: record.fetchedAt,
        ageSeconds,
        motivo: error
          ? `${motivoDoErro(error)}; o último dado tem ${minutos(ageSeconds)} e está antigo demais`
          : `O último dado da fonte tem ${minutos(ageSeconds)} e está antigo demais`,
        cache,
        latencyMs,
        ...(erro ? { erro } : {}),
      };
    }
    let motivo: string | undefined;
    if (status === 'stale') {
      motivo = error
        ? `${motivoDoErro(error)}; usando dado de ${minutos(ageSeconds)} atrás`
        : `Dado da fonte com ${minutos(ageSeconds)} de idade`;
    }
    return {
      status,
      value: record.value,
      observedAt: record.observedAt,
      fetchedAt: record.fetchedAt,
      ageSeconds,
      cache,
      latencyMs,
      ...(motivo ? { motivo } : {}),
      ...(erro ? { erro } : {}),
    };
  }

  private errorDetails(error: ProviderError): Record<string, unknown> {
    const details: Record<string, unknown> = { erro: error.kind, mensagem: error.message };
    if (error instanceof SchemaValidationError) {
      details.issues = error.issues;
      details.trecho = error.trecho;
    } else if (error instanceof InvalidJsonError) {
      details.trecho = error.trecho;
    } else if (error instanceof HttpStatusError) {
      details.httpStatus = error.status;
      details.trecho = error.trecho;
    }
    return details;
  }

  private updateStats(
    source: string,
    patch: Partial<ProviderStats> | ((current: ProviderStats) => Partial<ProviderStats>),
  ): void {
    const current = this.stats.get(source) ?? STATS_INICIAIS;
    this.stats.set(source, { ...current, ...(typeof patch === 'function' ? patch(current) : patch) });
  }
}
