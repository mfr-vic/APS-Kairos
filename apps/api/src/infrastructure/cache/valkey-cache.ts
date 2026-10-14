// Cache compartilhado no Valkey (RF27, T35, ADR-06): mesma CachePort do LRU, para a API e o worker lerem
// e gravarem as MESMAS entradas. Além do cache, coordena os processos:
//  - chaves quentes: a API registra num conjunto ordenado (score = último pedido) o que os usuários pediram;
//    o worker lê o conjunto e renova as entradas antes de vencerem (refresh-ahead fora da API);
//  - lock curto (SET NX PX): só um processo chama a fonte para a mesma chave por vez.
// Degradação segura: toda gravação vai também para um LRU local; se o Valkey falhar, a leitura cai nele
// (com log na troca de estado) e a API continua de pé. O lock, sem Valkey, é sempre concedido.
import { CONTRACT_VERSION } from '@kairos/contracts';
import { Valkey } from 'iovalkey';
import { systemClock, type Clock } from '../clock.js';
import type { CacheHit, CachePort } from './cache.port.js';
import { LruCache } from './lru-cache.js';

/** O subconjunto do cliente iovalkey usado aqui (os testes passam um dublê em memória). */
export interface ValkeyClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, px: 'PX', ms: number): Promise<unknown>;
  set(key: string, value: string, px: 'PX', ms: number, nx: 'NX'): Promise<string | null>;
  del(key: string): Promise<number>;
  zadd(key: string, score: number, member: string): Promise<unknown>;
  zremrangebyscore(key: string, min: number | string, max: number | string): Promise<unknown>;
  zremrangebyrank(key: string, start: number, stop: number): Promise<unknown>;
  zrange(key: string, start: number, stop: number): Promise<string[]>;
  pexpire(key: string, ms: number): Promise<unknown>;
  quit(): Promise<unknown>;
}

export interface CacheLogger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
}

/** Entrada pedida por um usuário: o bastante para outro processo refazer a chamada (provedor + entrada). */
export interface ChaveQuente {
  /** Chave completa do runner (`source:cacheKey(input)`). */
  key: string;
  source: string;
  ttlSeconds: number;
  input: unknown;
}

/** Coordenação entre processos usada pelo ProviderRunner e pelo worker. */
export interface CoordenacaoCache {
  registrarQuente(chave: ChaveQuente): void;
  /** true = este processo pode chamar a fonte para a chave agora. Expira sozinho em `ms`. */
  tentarLock(key: string, ms: number): Promise<boolean>;
}

export interface ValkeyCacheOptions {
  client: ValkeyClient;
  logger: CacheLogger;
  /** Quem grava ("api", "worker"): vai no registro e no log de hit, para saber quem produziu o dado. */
  escritor: string;
  clock?: Clock;
  /** B.8: o valor fica retido por 3×TTL para servir stale. */
  staleFactor?: number;
  /** Prefixo das chaves; padrão `kairos:<versão do contrato>:` (mudou o contrato, cache novo). */
  prefixo?: string;
  /** Uma chave quente some do conjunto se ninguém a pedir por este tempo. Padrão 6 h (igual ao refresh-ahead). */
  idleMs?: number;
  /** Máximo de chaves quentes. Padrão 50 (igual ao refresh-ahead). */
  maxQuentes?: number;
}

// Só a fonte vai para o log: a chave pode conter coordenadas do usuário
const fonteDa = (key: string) => key.split(':')[0];

interface Registro {
  v: unknown;
  /** storedAt (ms) */
  s: number;
  /** TTL (ms) */
  t: number;
  /** escritor */
  w: string;
}

export class ValkeyCache implements CachePort, CoordenacaoCache {
  private readonly local: LruCache;
  private readonly clock: Clock;
  private readonly staleFactor: number;
  private readonly prefixo: string;
  private readonly idleMs: number;
  private readonly maxQuentes: number;
  private degradado = false;

  constructor(private readonly o: ValkeyCacheOptions) {
    this.clock = o.clock ?? systemClock;
    this.staleFactor = o.staleFactor ?? 3;
    this.prefixo = o.prefixo ?? `kairos:${CONTRACT_VERSION}:`;
    this.idleMs = o.idleMs ?? 6 * 60 * 60_000;
    this.maxQuentes = o.maxQuentes ?? 50;
    this.local = new LruCache({ clock: this.clock, staleFactor: this.staleFactor });
  }

  /** true enquanto o Valkey estiver falhando e a leitura vier do LRU local. */
  get emFallback(): boolean {
    return this.degradado;
  }

  async get<T>(key: string): Promise<CacheHit<T> | undefined> {
    const r = await this.ler(key);
    if (r === 'erro') return this.local.get<T>(key);
    const agora = this.clock.now();
    if (!r || agora > r.s + r.t) {
      this.o.logger.info({ fonte: fonteDa(key), cache: 'miss' }, 'cache valkey');
      return undefined;
    }
    const idadeS = Math.max(0, (agora - r.s) / 1000);
    this.o.logger.info({ fonte: fonteDa(key), cache: 'hit', escritor: r.w, idadeS: Math.round(idadeS) }, 'cache valkey');
    return { value: r.v as T, storedAt: r.s, ageSeconds: idadeS };
  }

  async getStale<T>(key: string): Promise<CacheHit<T> | undefined> {
    const r = await this.ler(key);
    if (r === 'erro') return this.local.getStale<T>(key);
    if (!r) return undefined;
    return { value: r.v as T, storedAt: r.s, ageSeconds: Math.max(0, (this.clock.now() - r.s) / 1000) };
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.local.set(key, value, ttlSeconds); // valida o TTL e guarda a cópia do fallback
    const ttlMs = ttlSeconds * 1000;
    const registro: Registro = { v: value, s: this.clock.now(), t: ttlMs, w: this.o.escritor };
    await this.tentar(() => this.o.client.set(this.prefixo + key, JSON.stringify(registro), 'PX', Math.ceil(ttlMs * this.staleFactor)));
  }

  async delete(key: string): Promise<void> {
    await this.local.delete(key);
    await this.tentar(() => this.o.client.del(this.prefixo + key));
  }

  registrarQuente(chave: ChaveQuente): void {
    const conjunto = this.prefixo + 'quentes';
    const membro = JSON.stringify({ key: chave.key, source: chave.source, ttlSeconds: chave.ttlSeconds, input: chave.input ?? null });
    void this.tentar(async () => {
      await this.o.client.zadd(conjunto, this.clock.now(), membro);
      await this.o.client.pexpire(conjunto, this.idleMs);
    });
  }

  /** Chaves pedidas nas últimas `idleMs` (as mais antigas e as além de `maxQuentes` são descartadas). */
  async listarQuentes(): Promise<ChaveQuente[]> {
    const conjunto = this.prefixo + 'quentes';
    const membros = await this.tentar(async () => {
      await this.o.client.zremrangebyscore(conjunto, '-inf', this.clock.now() - this.idleMs);
      await this.o.client.zremrangebyrank(conjunto, 0, -(this.maxQuentes + 1));
      return this.o.client.zrange(conjunto, 0, -1);
    });
    if (!membros) return [];
    const chaves: ChaveQuente[] = [];
    for (const m of membros) {
      try {
        chaves.push(JSON.parse(m) as ChaveQuente);
      } catch {
        this.o.logger.warn({ membro: m.slice(0, 120) }, 'chave quente ilegível ignorada');
      }
    }
    return chaves;
  }

  async tentarLock(key: string, ms: number): Promise<boolean> {
    const r = await this.tentar(() => this.o.client.set(`${this.prefixo}lock:${key}`, this.o.escritor, 'PX', ms, 'NX'));
    // Sem Valkey não há com quem disputar: o processo segue sozinho
    return r === undefined ? true : r === 'OK';
  }

  async close(): Promise<void> {
    await this.o.client.quit().catch(() => undefined);
  }

  private async ler(key: string): Promise<Registro | null | 'erro'> {
    const bruto = await this.tentar(() => this.o.client.get(this.prefixo + key));
    if (bruto === undefined) return 'erro';
    if (bruto === null) return null;
    try {
      return JSON.parse(bruto) as Registro;
    } catch {
      this.o.logger.warn({ fonte: fonteDa(key) },'registro ilegível no valkey; tratado como ausente');
      return null;
    }
  }

  /** Executa no Valkey; em erro devolve undefined e registra a troca de estado (uma vez por queda). */
  private async tentar<R>(op: () => Promise<R>): Promise<R | undefined> {
    try {
      const r = await op();
      if (this.degradado) {
        this.degradado = false;
        this.o.logger.info({}, 'valkey de volta: cache compartilhado reativado');
      }
      return r;
    } catch (err) {
      if (!this.degradado) {
        this.degradado = true;
        this.o.logger.warn({ mensagem: (err as Error).message }, 'valkey indisponível: usando o LRU local');
      }
      return undefined;
    }
  }
}

/**
 * Cliente iovalkey para a API e o worker. Falha rápido sem conexão (sem fila offline, 500 ms por comando)
 * para o cache nunca segurar uma requisição; reconecta sozinho em segundo plano.
 */
export function conectarValkey(url: string, opts: { password?: string; logger: CacheLogger }): ValkeyClient {
  const client = new Valkey(url, {
    password: opts.password || undefined,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    commandTimeout: 500,
    connectTimeout: 2_000,
    retryStrategy: (tentativas: number) => Math.min(tentativas * 500, 5_000),
  });
  let caiu = false;
  // Sem este ouvinte, o erro de conexão vira exceção não tratada e derruba o processo
  client.on('error', (err: Error) => {
    if (caiu) return;
    caiu = true;
    opts.logger.warn({ mensagem: err.message }, 'conexão com o valkey falhou');
  });
  client.on('ready', () => {
    caiu = false;
    opts.logger.info({}, 'conectado ao valkey');
  });
  return client as unknown as ValkeyClient;
}
