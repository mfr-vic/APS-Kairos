import { describe, expect, it } from 'vitest';
import { LruCache } from '../../src/infrastructure/cache/lru-cache.js';
import { FakeClock } from './helpers.js';

describe('LruCache (T16, RF16)', () => {
  it('get devolve o valor dentro do TTL e undefined depois', async () => {
    const clock = new FakeClock();
    const cache = new LruCache({ clock });
    await cache.set('k', { a: 1 }, 60);
    clock.advance(59_000);
    expect((await cache.get<{ a: number }>('k'))?.value).toEqual({ a: 1 });
    clock.advance(2_000);
    expect(await cache.get('k')).toBeUndefined();
  });

  it('getStale devolve o valor vencido com a idade até 3×TTL', async () => {
    const clock = new FakeClock();
    const cache = new LruCache({ clock });
    await cache.set('k', 'v', 60);
    clock.advance(150_000);
    const stale = await cache.getStale<string>('k');
    expect(stale?.value).toBe('v');
    expect(stale?.ageSeconds).toBe(150);
    clock.advance(31_000); // 181 s > 3×60 s
    expect(await cache.getStale('k')).toBeUndefined();
  });

  it('remove a chave menos usada recentemente ao passar de maxEntries', async () => {
    const cache = new LruCache({ maxEntries: 2, clock: new FakeClock() });
    await cache.set('a', 1, 60);
    await cache.set('b', 2, 60);
    await cache.get('a'); // "a" passa a ser a mais recente
    await cache.set('c', 3, 60);
    expect(cache.size).toBe(2);
    expect(await cache.get('b')).toBeUndefined();
    expect((await cache.get<number>('a'))?.value).toBe(1);
    expect((await cache.get<number>('c'))?.value).toBe(3);
  });

  it('set na mesma chave substitui o valor e renova o TTL', async () => {
    const clock = new FakeClock();
    const cache = new LruCache({ clock });
    await cache.set('k', 1, 10);
    clock.advance(9_000);
    await cache.set('k', 2, 10);
    clock.advance(9_000);
    expect((await cache.get<number>('k'))?.value).toBe(2);
  });
});
