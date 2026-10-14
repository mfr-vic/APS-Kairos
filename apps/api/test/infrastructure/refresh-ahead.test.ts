import { afterEach, describe, expect, it, vi } from 'vitest';
import { RefreshAhead, type RefreshJob } from '../../src/infrastructure/refresh-ahead.js';
import { FakeClock, memoryLogger } from './helpers.js';

const TTL_S = 15 * 60;
const TTL_MS = TTL_S * 1000;

/** Cache de mentira: só o instante de gravação por chave. */
function setup(opts: { maxKeys?: number; idleMs?: number } = {}) {
  const clock = new FakeClock();
  const logger = memoryLogger();
  const gravadoEm = new Map<string, number>();
  const ra = new RefreshAhead({ clock, logger, storedAt: async (k) => gravadoEm.get(k), ...opts });
  /** Job que conta execuções; `comportamento` decide o resultado (padrão: grava agora). */
  const job = (key: string, comportamento?: (ctx: { signal: AbortSignal; timeoutMs: number }) => Promise<void>) => {
    const j = {
      key,
      source: 'open-meteo',
      ttlSeconds: TTL_S,
      runs: 0,
      ctxs: [] as { signal: AbortSignal; timeoutMs: number }[],
      async run(ctx: { signal: AbortSignal; timeoutMs: number }) {
        j.runs++;
        j.ctxs.push(ctx);
        if (comportamento) return comportamento(ctx);
        gravadoEm.set(key, clock.now());
      },
    };
    return j satisfies RefreshJob;
  };
  return { clock, logger, gravadoEm, ra, job };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('RefreshAhead', () => {
  it('renova só a partir de 80 % do TTL, com prazo de fundo de 15 s', async () => {
    const { clock, gravadoEm, ra, job } = setup();
    const j = job('sp');
    gravadoEm.set('sp', clock.now());
    ra.track(j);

    await ra.tick();
    clock.advance(0.79 * TTL_MS);
    await ra.tick();
    expect(j.runs).toBe(0);

    clock.advance(0.01 * TTL_MS); // 80 %
    await ra.tick();
    expect(j.runs).toBe(1);
    expect(j.ctxs[0]!.timeoutMs).toBe(15_000);

    await ra.tick(); // acabou de gravar: não está mais perto de vencer
    expect(j.runs).toBe(1);
  });

  it('chave sem entrada no cache (ou vencida) renova na hora', async () => {
    const { ra, job } = setup();
    const j = job('sp');
    ra.track(j);
    await ra.refreshIfDue('sp');
    expect(j.runs).toBe(1);
  });

  it('nunca renova a mesma chave em paralelo', async () => {
    const { clock, gravadoEm, ra, job } = setup();
    let liberar!: () => void;
    const j = job('sp', () => new Promise<void>((resolve) => (liberar = () => {
      gravadoEm.set('sp', clock.now());
      resolve();
    })));
    ra.track(j);

    const a = ra.refreshIfDue('sp');
    const b = ra.refreshIfDue('sp');
    const c = ra.tick();
    await vi.waitFor(() => expect(j.runs).toBe(1));
    liberar();
    await Promise.all([a, b, c]);
    expect(j.runs).toBe(1);
  });

  it('esquece a chave que ninguém pede há mais de idleMs (sem usuários, sem chamadas)', async () => {
    const { clock, ra, job, logger } = setup({ idleMs: 60 * 60_000 });
    const j = job('sp');
    ra.track(j);
    await ra.tick(); // renova (sem entrada)
    clock.advance(60 * 60_000 + 1);
    await ra.tick();
    expect(ra.keys).toEqual([]);
    expect(j.runs).toBe(1);
    expect(logger.lines.at(-1)!.msg).toContain('esquecida');
  });

  it('pedido novo da mesma chave adia o esquecimento', async () => {
    const { clock, ra, job } = setup({ idleMs: 60 * 60_000 });
    ra.track(job('sp'));
    clock.advance(50 * 60_000);
    ra.track(job('sp'));
    clock.advance(50 * 60_000);
    await ra.tick();
    expect(ra.keys).toEqual(['sp']);
  });

  it('LRU: ao passar de maxKeys, sai a chave pedida há mais tempo', () => {
    const { ra, job } = setup({ maxKeys: 2 });
    ra.track(job('a'));
    ra.track(job('b'));
    ra.track(job('a'));
    ra.track(job('c'));
    expect(ra.keys).toEqual(['a', 'c']);
  });

  it('falha na renovação: loga, não lança e espera 60 s antes de tentar de novo a chave', async () => {
    const { clock, ra, job, logger } = setup();
    const j = job('sp', async () => {
      throw new Error('ECONNRESET');
    });
    ra.track(j);

    await expect(ra.refreshIfDue('sp')).resolves.toBeUndefined();
    expect(logger.lines.at(-1)).toMatchObject({ level: 'warn', msg: 'renovação antecipada falhou', obj: { erro: 'network' } });
    clock.advance(30_000);
    await ra.tick();
    expect(j.runs).toBe(1);
    clock.advance(30_000);
    await ra.tick();
    expect(j.runs).toBe(2);
  });

  it('start() varre a cada 30 s; stop() para o timer e aborta a renovação em voo', async () => {
    vi.useFakeTimers();
    const { ra, job } = setup();
    let sinal: AbortSignal | undefined;
    const j = job('sp', (ctx) => {
      sinal = ctx.signal;
      return new Promise<void>(() => undefined);
    });
    ra.track(j);
    ra.start();

    await vi.advanceTimersByTimeAsync(29_999);
    expect(j.runs).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(j.runs).toBe(1);

    ra.stop();
    expect(sinal!.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(j.runs).toBe(1);
  });
});
