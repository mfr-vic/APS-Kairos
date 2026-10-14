// Dublê em memória do subconjunto do cliente Valkey (ValkeyClient) usado pelo ValkeyCache (RF27).
// Respeita PX e NX pelo relógio dado; `fora = true` simula o Valkey caído (todo comando rejeita).
import type { Clock } from '../../../src/infrastructure/clock.js';
import type { ValkeyClient } from '../../../src/infrastructure/cache/valkey-cache.js';

export class FakeValkey implements ValkeyClient {
  fora = false;
  readonly strings = new Map<string, { v: string; expira: number }>();
  readonly zsets = new Map<string, Map<string, number>>();
  readonly comandos: string[] = [];

  constructor(private readonly clock: Clock) {}

  private checar(cmd: string): void {
    this.comandos.push(cmd);
    if (this.fora) throw new Error('Connection is closed.');
  }

  async get(key: string): Promise<string | null> {
    this.checar('get');
    const e = this.strings.get(key);
    if (!e || this.clock.now() >= e.expira) return null;
    return e.v;
  }

  set(key: string, value: string, px: 'PX', ms: number): Promise<unknown>;
  set(key: string, value: string, px: 'PX', ms: number, nx: 'NX'): Promise<string | null>;
  async set(key: string, value: string, _px: 'PX', ms: number, nx?: 'NX'): Promise<string | null> {
    this.checar(nx ? 'set-nx' : 'set');
    // Atômico como no Valkey: a checagem e a gravação acontecem sem `await` no meio
    const atual = this.strings.get(key);
    if (nx && atual && this.clock.now() < atual.expira) return null;
    this.strings.set(key, { v: value, expira: this.clock.now() + ms });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    this.checar('del');
    return this.strings.delete(key) ? 1 : 0;
  }

  private zset(key: string): Map<string, number> {
    let z = this.zsets.get(key);
    if (!z) this.zsets.set(key, (z = new Map()));
    return z;
  }

  private ordenado(key: string): [string, number][] {
    return [...this.zset(key).entries()].sort((a, b) => a[1] - b[1]);
  }

  async zadd(key: string, score: number, member: string): Promise<unknown> {
    this.checar('zadd');
    this.zset(key).set(member, score);
    return 1;
  }

  async zremrangebyscore(key: string, min: number | string, max: number | string): Promise<unknown> {
    this.checar('zremrangebyscore');
    const lo = min === '-inf' ? -Infinity : Number(min);
    const hi = Number(max);
    for (const [m, s] of this.zset(key)) if (s >= lo && s <= hi) this.zset(key).delete(m);
    return 0;
  }

  async zremrangebyrank(key: string, start: number, stop: number): Promise<unknown> {
    this.checar('zremrangebyrank');
    const itens = this.ordenado(key);
    const fim = stop < 0 ? itens.length + stop : stop;
    itens.slice(start, fim + 1).forEach(([m]) => this.zset(key).delete(m));
    return 0;
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    this.checar('zrange');
    const itens = this.ordenado(key);
    const fim = stop < 0 ? itens.length + stop : stop;
    return itens.slice(start, fim + 1).map(([m]) => m);
  }

  async pexpire(): Promise<unknown> {
    this.checar('pexpire');
    return 1;
  }

  async quit(): Promise<unknown> {
    return 'OK';
  }
}
