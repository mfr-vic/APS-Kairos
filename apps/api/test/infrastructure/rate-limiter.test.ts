import { describe, expect, it } from 'vitest';
import { RateLimitedError } from '../../src/infrastructure/errors.js';
import { LimiteCota, MinIntervalLimiter, RATE_LIMITS, SlidingWindowLimiter } from '../../src/infrastructure/rate-limiter.js';
import { FakeClock } from './helpers.js';

describe('LimiteCota (TomTom: cota diária + QPS + Retry-After)', () => {
  it('espaça pelo intervalo, recusa acima da cota da janela e libera quando a janela anda', async () => {
    const clock = new FakeClock();
    const esperas: number[] = [];
    const limite = new LimiteCota({ intervalMs: 250, maxRequests: 3, windowMs: 60_000, clock, sleep: async (ms) => void esperas.push(ms) });
    await limite.acquire();
    await limite.acquire();
    await limite.acquire();
    expect(esperas).toEqual([250, 500]);
    await expect(limite.acquire()).rejects.toBeInstanceOf(RateLimitedError);
    expect(limite.usadasNaJanela).toBe(3);
    clock.advance(60_000);
    await expect(limite.acquire()).resolves.toBeUndefined();
  });

  it('bloquearAte recusa sem gastar a cota até o instante pedido', async () => {
    const clock = new FakeClock();
    const limite = new LimiteCota({ intervalMs: 1, maxRequests: 10, windowMs: 60_000, clock, sleep: async () => undefined });
    limite.bloquearAte(clock.now() + 5_000);
    await expect(limite.acquire()).rejects.toBeInstanceOf(RateLimitedError);
    expect(limite.usadasNaJanela).toBe(0);
    clock.advance(5_000);
    await expect(limite.acquire()).resolves.toBeUndefined();
  });

  it('limites da TomTom ficam abaixo do plano gratuito (20 mil rotas e 200 mil tiles por mês; 5 e 10 QPS)', () => {
    expect(RATE_LIMITS.tomtomRotas.maxRequests * 31).toBeLessThanOrEqual(20_000);
    expect(RATE_LIMITS.tomtomTiles.maxRequests * 31).toBeLessThanOrEqual(200_000);
    expect(1_000 / RATE_LIMITS.tomtomRotas.intervalMs).toBeLessThan(5);
    expect(1_000 / RATE_LIMITS.tomtomTiles.intervalMs).toBeLessThan(10);
  });
});

describe('MinIntervalLimiter (T16, RNF03: OSRM/Nominatim ≤ 1 req/s)', () => {
  it('espaça chamadas simultâneas em pelo menos 1 s', async () => {
    const clock = new FakeClock();
    const esperas: number[] = [];
    const limiter = new MinIntervalLimiter({
      intervalMs: 1_000,
      clock,
      sleep: async (ms) => {
        esperas.push(ms);
      },
    });
    await Promise.all([limiter.acquire(), limiter.acquire(), limiter.acquire()]);
    expect(esperas).toEqual([1_000, 2_000]);
  });

  it('não espera se o intervalo já passou', async () => {
    const clock = new FakeClock();
    const esperas: number[] = [];
    const limiter = new MinIntervalLimiter({ intervalMs: 1_000, clock, sleep: async (ms) => void esperas.push(ms) });
    await limiter.acquire();
    clock.advance(1_500);
    await limiter.acquire();
    clock.advance(400);
    await limiter.acquire();
    expect(esperas).toEqual([600]);
  });
});

describe('SlidingWindowLimiter (T16, RNF03: ARTESP ≤ 10 req/h)', () => {
  it('recusa a 11ª chamada na mesma hora e libera quando a janela anda', async () => {
    const clock = new FakeClock();
    const limiter = new SlidingWindowLimiter({ maxRequests: 10, windowMs: 3_600_000, clock });
    for (let i = 0; i < 10; i++) {
      await limiter.acquire();
      clock.advance(60_000);
    }
    await expect(limiter.acquire()).rejects.toBeInstanceOf(RateLimitedError);
    expect(limiter.usedInWindow).toBe(10);
    clock.advance(3_600_000 - 10 * 60_000); // a 1ª chamada sai da janela
    await expect(limiter.acquire()).resolves.toBeUndefined();
  });
});
