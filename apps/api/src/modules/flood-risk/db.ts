// Conexão com o PostgreSQL/PostGIS (T22/T23).
// Lê DB_HOST, DB_PORT, DB_USER, DB_PASSWORD e DB_NAME do ambiente. A senha nunca é registrada em log.

import pg from 'pg';
import type { Pool, PoolConfig, QueryResult, QueryResultRow } from 'pg';

/** O mínimo que o FloodRiskService precisa: um `query` parametrizado (Pool, PoolClient ou dublê de teste). */
export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
}

/** Variáveis de ambiente (mesmo formato de process.env). */
export type Ambiente = Record<string, string | undefined>;

export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string | undefined;
  database: string;
}

/** Valores padrão = os do docker-compose.yml (banco exposto no host, porta 5432). */
export function lerConfigDb(env: Ambiente = process.env): DbConfig {
  const porta = Number(env.DB_PORT ?? 5432);
  if (!Number.isInteger(porta) || porta <= 0 || porta > 65535) {
    throw new Error(`DB_PORT inválida: ${env.DB_PORT}`);
  }
  return {
    // 127.0.0.1 e não 'localhost': no Windows o Node resolve localhost para ::1 e o encaminhamento
    // IPv6 do Docker Desktop aceita o TCP mas a conexão do pg expira (medido em 10/10/2026).
    host: env.DB_HOST || '127.0.0.1',
    port: porta,
    user: env.DB_USER || 'kairos',
    password: env.DB_PASSWORD || undefined,
    database: env.DB_NAME || 'kairos',
  };
}

/** Descrição segura da conexão para logs (sem a senha). */
export function descreverConexao(c: DbConfig): string {
  return `postgres://${c.user}@${c.host}:${c.port}/${c.database}`;
}

export function criarPool(env: Ambiente = process.env, extra: Partial<PoolConfig> = {}): Pool {
  const c = lerConfigDb(env);
  const pool = new pg.Pool({
    host: c.host,
    port: c.port,
    user: c.user,
    password: c.password,
    database: c.database,
    max: 5,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
    application_name: 'kairos-api',
    ...extra,
  });
  // Sem este ouvinte, um erro numa conexão ociosa derruba o processo.
  pool.on('error', (err) => console.error(`[db] erro em conexão ociosa: ${err.message}`));
  return pool;
}
