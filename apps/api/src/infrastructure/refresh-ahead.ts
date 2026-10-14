// Renovação antecipada (refresh-ahead / stale-while-revalidate) — defeito medido em 13/10/2026.
//
// Por quê: com TTL de 15 min (clima) e 60 min (ar), quase toda consulta depois de um período parado
// achava o cache vencido e precisava ir à fonte NA HORA, com 3 s de timeout (C.5). Medido no container:
// a 1ª conexão a uma fonte às vezes demora muito mais que as seguintes (handshake intercontinental,
// perda de SYN, servidor "frio": a página do Metrô levou 31 s numa conexão nova e ~0,3 s nas seguintes).
// Como o timeout abortava a chamada, a conexão lenta nunca terminava e a próxima também nascia fria.
//
// O padrão: o servidor lembra as chaves que os usuários pediram há pouco (LRU pequena) e as renova em
// segundo plano quando chegam a ~80 % do TTL, com prazo próprio e maior (15 s), fora do caminho da
// requisição e do prazo de 4 s do briefing. O usuário passa a ler sempre do cache `fresh`; se a fonte
// falhar, o cache bom continua lá (serve `stale` até 3×TTL, B.8). É o mesmo trade-off de CDNs e do
// `stale-while-revalidate` do HTTP (RFC 5861): troca algumas chamadas extras à fonte por latência
// previsível e disponibilidade. Limites: só provedores opt-in (sem limite de taxa apertado), uma
// renovação por chave por vez, respeita o circuit breaker e os limitadores (passa pelo runner), e uma
// chave que ninguém pede há `idleMs` é esquecida (sem usuários, sem chamadas).
import { systemClock, type Clock } from './clock.js';
import { toProviderError } from './errors.js';

export interface RefreshLogger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
}

/** Uma entrada renovável: o runner monta `run` (chama a fonte e grava no cache; lança em falha). */
export interface RefreshJob {
  key: string;
  source: string;
  ttlSeconds: number;
  run(ctx: { signal: AbortSignal; timeoutMs: number }): Promise<void>;
}

export interface RefreshAheadOptions {
  logger: RefreshLogger;
  /** Quando a entrada foi gravada no cache (ms), ou undefined se não houver. */
  storedAt(key: string): Promise<number | undefined>;
  clock?: Clock;
  /** Máximo de chaves lembradas (LRU). Padrão 50. */
  maxKeys?: number;
  /** Esquece a chave se ninguém a pedir por este tempo. Padrão 6 h. */
  idleMs?: number;
  /** Fração do TTL a partir da qual renova. Padrão 0,8. */
  fraction?: number;
  /** Prazo de cada renovação em segundo plano. Padrão 15 s. */
  timeoutMs?: number;
  /** Período da varredura. Padrão 30 s. */
  intervalMs?: number;
  /** Espera mínima antes de tentar de novo uma chave cuja renovação falhou. Padrão 60 s. */
  retryMs?: number;
  /**
   * Lock entre processos (worker com Valkey, RF27): false = outro processo já busca a chave; pula esta vez.
   * Ausente = sem disputa (um processo só).
   */
  lock?(key: string, ms: number): Promise<boolean>;
}

export const REFRESH_AHEAD_PADRAO = {
  maxKeys: 50,
  idleMs: 6 * 60 * 60_000,
  fraction: 0.8,
  timeoutMs: 15_000,
  intervalMs: 30_000,
  retryMs: 60_000,
} as const;

interface Tracked {
  job: RefreshJob;
  lastRequestedAt: number;
  nextAttemptAt: number;
}

export class RefreshAhead {
  private readonly tracked = new Map<string, Tracked>();
  private readonly inflight = new Map<string, Promise<void>>();
  private readonly stopController = new AbortController();
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly clock: Clock;
  private readonly cfg: typeof REFRESH_AHEAD_PADRAO;

  constructor(private readonly o: RefreshAheadOptions) {
    this.clock = o.clock ?? systemClock;
    this.cfg = {
      maxKeys: o.maxKeys ?? REFRESH_AHEAD_PADRAO.maxKeys,
      idleMs: o.idleMs ?? REFRESH_AHEAD_PADRAO.idleMs,
      fraction: o.fraction ?? REFRESH_AHEAD_PADRAO.fraction,
      timeoutMs: o.timeoutMs ?? REFRESH_AHEAD_PADRAO.timeoutMs,
      intervalMs: o.intervalMs ?? REFRESH_AHEAD_PADRAO.intervalMs,
      retryMs: o.retryMs ?? REFRESH_AHEAD_PADRAO.retryMs,
    } as typeof REFRESH_AHEAD_PADRAO;
  }

  /** Chaves lembradas (mais antiga primeiro). */
  get keys(): string[] {
    return [...this.tracked.keys()];
  }

  /** Registra que um usuário pediu a chave agora (move para o fim da LRU; a mais antiga sai). */
  track(job: RefreshJob): void {
    const anterior = this.tracked.get(job.key);
    this.tracked.delete(job.key);
    this.tracked.set(job.key, { job, lastRequestedAt: this.clock.now(), nextAttemptAt: anterior?.nextAttemptAt ?? 0 });
    while (this.tracked.size > this.cfg.maxKeys) {
      const maisAntiga = this.tracked.keys().next().value;
      if (maisAntiga === undefined) break;
      this.tracked.delete(maisAntiga);
    }
  }

  /**
   * Renova a chave se a entrada estiver a ≥ `fraction`×TTL, vencida ou ausente. Nunca lança.
   * Se já houver renovação da mesma chave em voo, devolve a mesma promessa (nada em paralelo).
   */
  async refreshIfDue(key: string): Promise<void> {
    const emVoo = this.inflight.get(key);
    if (emVoo) return emVoo;

    const t = this.tracked.get(key);
    if (!t || this.stopController.signal.aborted) return;
    if (this.clock.now() - t.lastRequestedAt > this.cfg.idleMs) {
      this.tracked.delete(key);
      this.o.logger.info({ provider: t.job.source }, 'renovação antecipada: chave esquecida por inatividade');
      return;
    }
    if (this.clock.now() < t.nextAttemptAt) return;
    const storedAt = await this.o.storedAt(key);
    if (storedAt !== undefined && this.clock.now() - storedAt < this.cfg.fraction * t.job.ttlSeconds * 1000) return;

    // Entre o `await` acima e aqui não há outro `await`: só uma chamada concorrente registra a renovação
    const outra = this.inflight.get(key);
    if (outra) return outra;
    const p = this.renovar(t, storedAt).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  /** Varre todas as chaves lembradas (chamada pelo timer; exposta para testes). */
  async tick(): Promise<void> {
    await Promise.all(this.keys.map((key) => this.refreshIfDue(key)));
  }

  start(): void {
    if (this.timer || this.stopController.signal.aborted) return;
    this.timer = setInterval(() => void this.tick(), this.cfg.intervalMs);
    this.timer.unref?.();
  }

  /** Para o timer e aborta as renovações em voo (no close do app). */
  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.stopController.abort();
  }

  private async renovar(t: Tracked, storedAt: number | undefined): Promise<void> {
    const inicio = this.clock.now();
    const idadeS = storedAt === undefined ? null : Math.round((inicio - storedAt) / 1000);
    // O lock dura o prazo da renovação + 5 s e expira sozinho (sem liberação explícita)
    if (this.o.lock && !(await this.o.lock(t.job.key, this.cfg.timeoutMs + 5_000))) {
      this.o.logger.info({ provider: t.job.source, idadeAnteriorS: idadeS }, 'renovação antecipada: outro processo já renova');
      return;
    }
    try {
      await t.job.run({ signal: this.stopController.signal, timeoutMs: this.cfg.timeoutMs });
      t.nextAttemptAt = 0;
      this.o.logger.info(
        { provider: t.job.source, idadeAnteriorS: idadeS, latencyMs: this.clock.now() - inicio },
        'renovação antecipada',
      );
    } catch (err) {
      // O cache bom não é apagado: a falha só adia a próxima tentativa desta chave
      t.nextAttemptAt = this.clock.now() + this.cfg.retryMs;
      const erro = toProviderError(err);
      this.o.logger.warn(
        { provider: t.job.source, idadeAnteriorS: idadeS, erro: erro.kind, mensagem: erro.message, latencyMs: this.clock.now() - inicio },
        'renovação antecipada falhou',
      );
    }
  }
}
