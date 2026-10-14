// Runner de migrations simples e idempotente (T22).
// - Aplica, em ordem, os arquivos NNN_nome.sql de apps/api/database/migrations/.
// - Registra cada uma em schema_migrations (versão + SHA-256 do arquivo).
// - Cada migration roda numa transação própria; se der erro, faz ROLLBACK e nada é registrado.
// - Um advisory lock impede dois runners ao mesmo tempo.
// - Se um arquivo já aplicado for alterado (checksum diferente), o runner para com erro:
//   migration aplicada não se edita, cria-se uma nova.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

export const DIRETORIO_MIGRATIONS = fileURLToPath(new URL('../../migrations/', import.meta.url));
const CHAVE_LOCK = 'kairos:schema_migrations';
const PADRAO_ARQUIVO = /^(\d{3})_[a-z0-9_]+\.sql$/;

export interface Migration {
  versao: string;
  arquivo: string;
  sql: string;
  checksum: string;
}

export function listarMigrations(dir: string = DIRETORIO_MIGRATIONS): Migration[] {
  const arquivos = readdirSync(dir)
    .filter((f) => PADRAO_ARQUIVO.test(f))
    .sort();
  const vistas = new Set<string>();
  return arquivos.map((arquivo) => {
    const versao = (arquivo.match(PADRAO_ARQUIVO) as RegExpMatchArray)[1];
    if (vistas.has(versao)) throw new Error(`versão de migration repetida: ${versao}`);
    vistas.add(versao);
    const sql = readFileSync(join(dir, arquivo), 'utf8');
    return { versao, arquivo, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  });
}

export interface ResultadoMigrations {
  aplicadas: string[];
  jaAplicadas: string[];
}

export async function aplicarMigrations(
  pool: Pool,
  dir: string = DIRETORIO_MIGRATIONS,
): Promise<ResultadoMigrations> {
  const migrations = listarMigrations(dir);
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [CHAVE_LOCK]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        checksum CHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query<{ version: string; checksum: string }>(
      'SELECT version, checksum FROM schema_migrations',
    );
    const aplicadasAntes = new Map(rows.map((r) => [r.version, r.checksum]));

    const resultado: ResultadoMigrations = { aplicadas: [], jaAplicadas: [] };
    for (const m of migrations) {
      const anterior = aplicadasAntes.get(m.versao);
      if (anterior !== undefined) {
        if (anterior !== m.checksum) {
          throw new Error(`migration ${m.arquivo} foi alterada depois de aplicada (checksum diferente)`);
        }
        resultado.jaAplicadas.push(m.arquivo);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query(
          'INSERT INTO schema_migrations (version, filename, checksum) VALUES ($1, $2, $3)',
          [m.versao, m.arquivo, m.checksum],
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`falha na migration ${m.arquivo}: ${(err as Error).message}`);
      }
      resultado.aplicadas.push(m.arquivo);
    }
    return resultado;
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [CHAVE_LOCK]).catch(() => undefined);
    client.release();
  }
}
