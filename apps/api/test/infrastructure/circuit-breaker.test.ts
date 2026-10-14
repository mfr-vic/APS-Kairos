import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from '../../src/infrastructure/circuit-breaker.js';
import { CircuitOpenError } from '../../src/infrastructure/errors.js';
import { FakeClock } from './helpers.js';

const falha = async () => {
  throw new Error('fonte fora do ar');
};

describe('CircuitBreaker (T16, RF15, C.5)', () => {
  it('TC18: com a fonte sempre falhando, 5 chamadas executam a fonte só 3 vezes', async () => {
    const breaker = new CircuitBreaker({ clock: new FakeClock() });
    let chamadas = 0;
    const erros: unknown[] = [];
    for (let i = 0; i < 5; i++) {
      await breaker
        .execute(async () => {
          chamadas++;
          return falha();
        })
        .catch((e: unknown) => erros.push(e));
    }
    expect(chamadas).toBe(3);
    expect(breaker.state).toBe('open');
    expect(erros.slice(3).every((e) => e instanceof CircuitOpenError)).toBe(true);
  });

  it('após 60 s entra em meia-abertura; sucesso fecha, falha reabre', async () => {
    const clock = new FakeClock();
    const breaker = new CircuitBreaker({ clock });
    for (let i = 0; i < 3; i++) await breaker.execute(falha).catch(() => undefined);
    clock.advance(59_999);
    expect(breaker.state).toBe('open');
    clock.advance(1);
    expect(breaker.state).toBe('half-open');

    await breaker.execute(falha).catch(() => undefined); // tentativa de teste falha
    expect(breaker.state).toBe('open');

    clock.advance(60_000);
    expect(await breaker.execute(async () => 'ok')).toBe('ok');
    expect(breaker.state).toBe('closed');
  });

  it('em meia-abertura só deixa passar uma tentativa por vez', () => {
    const clock = new FakeClock();
    const breaker = new CircuitBreaker({ clock });
    for (let i = 0; i < 3; i++) breaker.recordFailure();
    clock.advance(60_000);
    expect(() => breaker.acquire()).not.toThrow();
    expect(() => breaker.acquire()).toThrow(CircuitOpenError);
  });

  it('sucesso zera a contagem de falhas consecutivas', async () => {
    const breaker = new CircuitBreaker({ clock: new FakeClock() });
    await breaker.execute(falha).catch(() => undefined);
    await breaker.execute(falha).catch(() => undefined);
    await breaker.execute(async () => 'ok');
    await breaker.execute(falha).catch(() => undefined);
    await breaker.execute(falha).catch(() => undefined);
    expect(breaker.state).toBe('closed');
  });
});
