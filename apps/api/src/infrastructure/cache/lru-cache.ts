// LRU em memória (T16, RF16): Map preserva a ordem de inserção; o primeiro item é o menos usado
import { systemClock, type Clock } from '../clock.js';
import type { CacheHit, CachePort } from './cache.port.js';

export interface LruCacheOptions {
  /** Número máximo de chaves; ao passar, sai a menos usada recentemente. */
  maxEntries?: number;
  /** Por quantos TTLs o valor vencido fica retido para getStale (B.8: 3×TTL). */
  staleFactor?: number;
  clock?: Clock;
}

interface Entry {
  value: unknown;
  storedAt: number;
  expiresAt: number;
  retainUntil: number;
}

export class LruCache implements CachePort {
  private readonly entries = new Map<string, Entry>();
  private readonly maxEntries: number;
  private readonly staleFactor: number;
  private readonly clock: Clock;

  constructor(options: LruCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 500;
    this.staleFactor = options.staleFactor ?? 3;
    this.clock = options.clock ?? systemClock;
    if (!Number.isInteger(this.maxEntries) || this.maxEntries < 1) {
      throw new RangeError('maxEntries deve ser um inteiro ≥ 1');
    }
    if (this.staleFactor < 1) throw new RangeError('staleFactor deve ser ≥ 1');
  }

  get size(): number {
    return this.entries.size;
  }

  async get<T>(key: string): Promise<CacheHit<T> | undefined> {
    const entry = this.touch(key);
    if (!entry || this.clock.now() > entry.expiresAt) return undefined;
    return this.toHit<T>(entry);
  }

  async getStale<T>(key: string): Promise<CacheHit<T> | undefined> {
    const entry = this.touch(key);
    return entry ? this.toHit<T>(entry) : undefined;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!(ttlSeconds > 0)) throw new RangeError('ttlSeconds deve ser > 0');
    const now = this.clock.now();
    const ttlMs = ttlSeconds * 1000;
    this.entries.delete(key);
    this.entries.set(key, { value, storedAt: now, expiresAt: now + ttlMs, retainUntil: now + ttlMs * this.staleFactor });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  /** Busca a entrada, descarta se passou da retenção e a move para o fim (mais recente). */
  private touch(key: string): Entry | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    if (this.clock.now() > entry.retainUntil) return undefined;
    this.entries.set(key, entry);
    return entry;
  }

  private toHit<T>(entry: Entry): CacheHit<T> {
    return {
      value: entry.value as T,
      storedAt: entry.storedAt,
      ageSeconds: Math.max(0, (this.clock.now() - entry.storedAt) / 1000),
    };
  }
}
