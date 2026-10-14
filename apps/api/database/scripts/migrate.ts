// Uso (a partir de apps/api):  npm run db:migrate
// Aplica as migrations pendentes de apps/api/database/migrations/ no banco indicado por DB_* (.env da raiz).

import { criarPool, descreverConexao, lerConfigDb } from '../../src/modules/flood-risk/db.js';
import { aplicarMigrations } from './lib/migrations.js';

const pool = criarPool(process.env, { application_name: 'kairos-migrate' });
try {
  console.info(`Banco: ${descreverConexao(lerConfigDb())}`);
  const r = await aplicarMigrations(pool);
  for (const f of r.jaAplicadas) console.info(`  já aplicada: ${f}`);
  for (const f of r.aplicadas) console.info(`  APLICADA:    ${f}`);
  console.info(
    r.aplicadas.length === 0 ? 'Nenhuma migration pendente.' : `${r.aplicadas.length} migration(s) aplicada(s).`,
  );
} catch (err) {
  console.error(`Erro: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
