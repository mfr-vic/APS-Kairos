// T22 / RF20: importação idempotente do GeoSampa "Alagamento (dados de Ocorrências)" para flood_points.
//
// Uso (a partir de apps/api):
//   npm run db:import-geosampa                         # baixa do WFS
//   npm run db:import-geosampa -- --file <arq.json>    # usa um GeoJSON já baixado (saída do WFS, EPSG:31983)
//   npm run db:import-geosampa -- --save <arq.json>    # baixa e também guarda o arquivo baixado
//
// Passos:
//   1. aplica as migrations pendentes (o upsert depende do UNIQUE(source_id) da 002);
//   2. obtém o arquivo e calcula o SHA-256 do conteúdo (crs + features; ignora o timeStamp do WFS);
//   3. se (fonte, hash) já está em dataset_imports, sai sem mudar nada;
//   4. numa transação: upsert por source_id com ST_Transform(31983 → 4326) no PostGIS, remove os pontos
//      desta fonte que sumiram do arquivo e registra o hash em dataset_imports;
//   5. confere: contagem no banco = fonte, sem duplicatas, índice GiST presente.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { criarPool, descreverConexao, lerConfigDb } from '../../src/modules/flood-risk/db.js';
import {
  FONTE_DATASET,
  PREFIXO_SOURCE_ID,
  USER_AGENT,
  WFS_URL,
  hashConteudo,
  transformarGeoJson,
} from './lib/geosampa.js';
import { aplicarMigrations } from './lib/migrations.js';

// Retângulo da cidade de São Paulo usado no projeto (só para conferência; não filtra nada).
const BBOX = { latMin: -24.01, latMax: -23.35, lonMin: -46.83, lonMax: -46.36 };

const { values: opt } = parseArgs({ options: { file: { type: 'string' }, save: { type: 'string' } } });

async function obterArquivo(): Promise<{ buf: Buffer; origem: string }> {
  if (opt.file) {
    const caminho = resolve(opt.file);
    return { buf: readFileSync(caminho), origem: caminho };
  }
  const res = await fetch(WFS_URL, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} no WFS GeoSampa`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (opt.save) writeFileSync(resolve(opt.save), buf);
  return { buf, origem: WFS_URL + (opt.save ? ` (salvo em ${resolve(opt.save)})` : '') };
}

const pool = criarPool(process.env, { application_name: 'kairos-import-geosampa' });
try {
  console.info(`Banco: ${descreverConexao(lerConfigDb())}`);
  const mig = await aplicarMigrations(pool);
  console.info(
    mig.aplicadas.length ? `Migrations aplicadas: ${mig.aplicadas.join(', ')}` : 'Migrations: nenhuma pendente.',
  );

  const { buf, origem } = await obterArquivo();
  const texto = buf.toString('utf8');
  const sha256Arquivo = createHash('sha256').update(buf).digest('hex');
  // O que vai para dataset_imports.file_hash é o hash do conteúdo (ver hashConteudo).
  const sha256 = hashConteudo(texto);
  const linhas = transformarGeoJson(texto);
  console.info(`Origem: ${origem}`);
  console.info(`Bytes: ${buf.length}  SHA-256 do arquivo: ${sha256Arquivo}`);
  console.info(`SHA-256 do conteúdo (crs+features): ${sha256}  Feições na fonte: ${linhas.length}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serializa importações concorrentes desta fonte.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`kairos:import:${FONTE_DATASET}`]);

    const ja = await client.query(
      'SELECT 1 FROM dataset_imports WHERE source = $1 AND file_hash = $2 LIMIT 1',
      [FONTE_DATASET, sha256],
    );
    if (ja.rows.length > 0) {
      await client.query('ROLLBACK');
      console.info('Hash já registrado em dataset_imports: nada a fazer (idempotente).');
    } else {
      const upsert = await client.query(
        `INSERT INTO flood_points (source_id, occurred_on, address, geom)
         SELECT t.source_id, t.occurred_on, t.address,
                ST_Transform(ST_SetSRID(ST_MakePoint(t.x, t.y), 31983), 4326)
           FROM unnest($1::text[], $2::date[], $3::text[], $4::float8[], $5::float8[])
                AS t(source_id, occurred_on, address, x, y)
         ON CONFLICT (source_id) DO UPDATE
            SET occurred_on = EXCLUDED.occurred_on, address = EXCLUDED.address, geom = EXCLUDED.geom`,
        [
          linhas.map((l) => l.sourceId),
          linhas.map((l) => l.ocorridoEm),
          linhas.map((l) => l.endereco),
          linhas.map((l) => l.x),
          linhas.map((l) => l.y),
        ],
      );
      const removidas = await client.query(
        `DELETE FROM flood_points
          WHERE starts_with(source_id, $1) AND NOT (source_id = ANY($2::text[]))`,
        [PREFIXO_SOURCE_ID, linhas.map((l) => l.sourceId)],
      );
      await client.query('INSERT INTO dataset_imports (source, file_hash, rows) VALUES ($1, $2, $3)', [
        FONTE_DATASET,
        sha256,
        linhas.length,
      ]);
      await client.query('COMMIT');
      console.info(
        `Importado: ${upsert.rowCount} linha(s) inseridas/atualizadas; ` +
          `${removidas.rowCount} removida(s) por não estarem mais na fonte.`,
      );
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }

  // Conferência (TC11).
  const { rows } = await pool.query<{ total: string; distintos: string; no_bbox: string }>(
    `SELECT count(*) AS total, count(DISTINCT source_id) AS distintos,
            count(*) FILTER (WHERE ST_Y(geom) BETWEEN $2 AND $3 AND ST_X(geom) BETWEEN $4 AND $5) AS no_bbox
       FROM flood_points WHERE starts_with(source_id, $1)`,
    [PREFIXO_SOURCE_ID, BBOX.latMin, BBOX.latMax, BBOX.lonMin, BBOX.lonMax],
  );
  const { total, distintos, no_bbox } = rows[0];
  const gist = await pool.query<{ indexname: string }>(
    `SELECT indexname FROM pg_indexes
      WHERE tablename = 'flood_points' AND indexdef ILIKE '%USING gist%' ORDER BY indexname`,
  );
  const regs = await pool.query<{ n: string }>(
    'SELECT count(*) AS n FROM dataset_imports WHERE source = $1',
    [FONTE_DATASET],
  );
  console.info(
    `flood_points (${PREFIXO_SOURCE_ID}*): ${total} (source_id distintos: ${distintos}; ` +
      `dentro do retângulo de SP: ${no_bbox})`,
  );
  console.info(`Índices GiST em flood_points: ${gist.rows.map((r) => r.indexname).join(', ') || '(nenhum)'}`);
  console.info(`dataset_imports (${FONTE_DATASET}): ${regs.rows[0].n} registro(s)`);
  if (Number(total) !== linhas.length) {
    throw new Error(`contagem diverge: fonte ${linhas.length} x banco ${total}`);
  }
  console.info('Contagem conferida: fonte = banco.');
} catch (err) {
  console.error(`Erro: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
