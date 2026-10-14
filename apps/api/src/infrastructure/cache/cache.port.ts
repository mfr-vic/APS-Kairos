// CachePort (T16, RF16, C.3): get/set com TTL e getStale. Assíncrono para permitir Valkey depois (opcional).

export interface CacheHit<T> {
  value: T;
  /** Instante (ms) em que o valor foi gravado. */
  storedAt: number;
  /** Idade do valor em segundos (agora − storedAt). */
  ageSeconds: number;
}

export interface CachePort {
  /** Valor dentro do TTL; `undefined` se ausente ou vencido. */
  get<T>(key: string): Promise<CacheHit<T> | undefined>;
  /** Grava com TTL em segundos. O valor vencido continua disponível em getStale por um tempo (ver a implementação). */
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  /** Valor mesmo vencido, com a idade, enquanto estiver retido (caso stale ≤ 3×TTL, B.8). */
  getStale<T>(key: string): Promise<CacheHit<T> | undefined>;
  delete(key: string): Promise<void>;
}
