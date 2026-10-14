#!/usr/bin/env node
// Spike T07 — importação de TESTE do GeoSampa "Alagamento (dados de Ocorrências)".
// Node 24 puro (sem dependências). Fala com o PostGIS via `docker exec kairos-db psql`.
//
// Uso:
//   node spikes/geosampa/import.mjs [opções]
//     --file <caminho.json>   usa um GeoJSON já baixado (saída WFS application/json, EPSG:31983)
//                             sem --file, baixa do WFS para %TEMP%/kairos-geosampa/
//     --to-flood-points       também insere em flood_points (source_id = "geosampa:alagamento:<cd_identificador>")
//     --register              grava (source, sha256, rows) em dataset_imports e PULA se o hash já existir
//     --fixture <saida.json>  grava ~5 feições reais em WGS84 (lidas do banco depois da transformação)
//     --cleanup               remove spike_flood_raw, as linhas geosampa:alagamento:* de flood_points
//                             e o registro em dataset_imports desta fonte; depois sai
//     --keep-raw              não dropa spike_flood_raw ao final
//
// Fonte: WFS GeoSampa, camada geoportal:risco_ocorrencia_alagamento (link de distribuição dos metadados
// 432c06b1-03a1-4b1f-9210-423e1b58e869). Geometria Point em SIRGAS 2000 / UTM 23S (EPSG:31983).

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const SOURCE = 'geosampa_alagamento';
const ID_PREFIX = 'geosampa:alagamento:';
const WFS_URL =
  'http://wfs.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/wfs?service=WFS&version=2.0.0' +
  '&request=GetFeature&typeNames=geoportal:risco_ocorrencia_alagamento&outputFormat=application/json';
const USER_AGENT = 'Kairos-APS/0.1 (projeto academico; contato: mfr.vic@gmail.com)';
// Retângulo da cidade de São Paulo usado no projeto.
const BBOX = { latMin: -24.01, latMax: -23.35, lonMin: -46.83, lonMax: -46.36 };

const { values: opt } = parseArgs({
  options: {
    file: { type: 'string' },
    'to-flood-points': { type: 'boolean', default: false },
    register: { type: 'boolean', default: false },
    fixture: { type: 'string' },
    cleanup: { type: 'boolean', default: false },
    'keep-raw': { type: 'boolean', default: false },
  },
});

function psql(sql) {
  const r = spawnSync(
    'docker',
    ['exec', '-i', 'kairos-db', 'psql', '-U', 'kairos', '-d', 'kairos', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'],
    { input: `SET client_encoding = 'UTF8';\n${sql}`, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (r.status !== 0) throw new Error(`psql falhou (${r.status}):\n${r.stderr}`);
  return r.stdout.trim();
}

const lit = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replaceAll("'", "''")}'`);
const dateLit = (v) => (v ? lit(String(v).replace(/Z$/, '')) + '::date' : 'NULL');

if (opt.cleanup) {
  const out = psql(`
    DROP TABLE IF EXISTS spike_flood_raw;
    WITH d AS (DELETE FROM flood_points WHERE source_id LIKE '${ID_PREFIX}%' RETURNING 1) SELECT 'flood_points removidas: ' || count(*) FROM d;
    WITH d AS (DELETE FROM dataset_imports WHERE source = '${SOURCE}' RETURNING 1) SELECT 'dataset_imports removidos: ' || count(*) FROM d;`);
  console.log(out);
  process.exit(0);
}

// 1) Obter o arquivo
let buf;
let filePath = opt.file ? resolve(opt.file) : null;
if (filePath) {
  buf = readFileSync(filePath);
} else {
  const dir = join(tmpdir(), 'kairos-geosampa');
  mkdirSync(dir, { recursive: true });
  filePath = join(dir, `alagamento-${new Date().toISOString().slice(0, 10)}.json`);
  console.log(`Baixando ${WFS_URL}`);
  const res = await fetch(WFS_URL, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} no WFS`);
  buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(filePath, buf);
}
const sha256 = createHash('sha256').update(buf).digest('hex');
const fc = JSON.parse(buf.toString('utf8'));
const crs = fc.crs?.properties?.name ?? '(sem crs)';
if (!/EPSG::?31983$/.test(crs)) throw new Error(`CRS inesperado: ${crs}`);
const feats = fc.features;
console.log(`Arquivo: ${filePath}\nBytes: ${buf.length}\nSHA-256: ${sha256}\nCRS: ${crs}\nFeições na fonte: ${feats.length} (numberMatched=${fc.numberMatched})`);
if (fc.numberMatched !== undefined && fc.numberMatched !== feats.length) {
  throw new Error('numberMatched != features.length — resposta paginada/truncada');
}

// 2) Idempotência por hash
if (opt.register) {
  const seen = psql(`SELECT count(*) FROM dataset_imports WHERE source='${SOURCE}' AND file_hash='${sha256}';`);
  if (seen !== '0') {
    console.log('Hash já registrado em dataset_imports — nada a fazer (idempotente).');
    process.exit(0);
  }
}

// 3) Carga bruta em spike_flood_raw (geometria original 31983 + transformada 4326)
const rows = feats.map((f) => {
  const p = f.properties;
  const [x, y] = f.geometry.coordinates;
  return `(${lit(f.id)}, ${lit(p.cd_identificador)}, ${dateLit(p.dt_ocorrencia)}, ${lit(p.dc_tipo_ocorrencia)}, ${lit(p.nm_distrito)}, ${lit(p.nm_subprefeitura)}, ${lit(p.sg_fonte_original)}, ${dateLit(p.dt_carga)}, ST_SetSRID(ST_MakePoint(${x}, ${y}), 31983))`;
});
psql(`
BEGIN;
DROP TABLE IF EXISTS spike_flood_raw;
CREATE TABLE spike_flood_raw (
  fid TEXT, cd_identificador TEXT, dt_ocorrencia DATE, dc_tipo_ocorrencia TEXT, nm_distrito TEXT,
  nm_subprefeitura TEXT, sg_fonte_original TEXT, dt_carga DATE,
  geom_utm GEOMETRY(Point, 31983) NOT NULL,
  geom GEOMETRY(Point, 4326)
);
INSERT INTO spike_flood_raw (fid, cd_identificador, dt_ocorrencia, dc_tipo_ocorrencia, nm_distrito, nm_subprefeitura, sg_fonte_original, dt_carga, geom_utm) VALUES
${rows.join(',\n')};
UPDATE spike_flood_raw SET geom = ST_Transform(geom_utm, 4326);
COMMIT;`);

const stats = psql(`SELECT count(*), count(DISTINCT cd_identificador), min(dt_ocorrencia), max(dt_ocorrencia),
  count(*) FILTER (WHERE ST_Y(geom) BETWEEN ${BBOX.latMin} AND ${BBOX.latMax} AND ST_X(geom) BETWEEN ${BBOX.lonMin} AND ${BBOX.lonMax})
  FROM spike_flood_raw;`).split('|');
const [dbCount, distinctIds, dMin, dMax, inBbox] = stats;
console.log(`Linhas em spike_flood_raw: ${dbCount} (ids distintos ${distinctIds}); datas ${dMin} a ${dMax}; dentro do retângulo de SP: ${inBbox}`);
if (Number(dbCount) !== feats.length) throw new Error(`Contagem diverge: fonte ${feats.length} x banco ${dbCount}`);
console.log('Contagem conferida: fonte = banco.');

// 4) Inserção de teste em flood_points (address <- nm_subprefeitura, pois a fonte não tem endereço)
if (opt['to-flood-points']) {
  const out = psql(`
BEGIN;
DELETE FROM flood_points WHERE source_id LIKE '${ID_PREFIX}%';
INSERT INTO flood_points (source_id, occurred_on, address, geom)
  SELECT '${ID_PREFIX}' || cd_identificador, dt_ocorrencia, nm_subprefeitura, geom FROM spike_flood_raw;
${opt.register ? `INSERT INTO dataset_imports (source, file_hash, rows) VALUES ('${SOURCE}', '${sha256}', ${feats.length});` : ''}
COMMIT;
SELECT count(*) FROM flood_points WHERE source_id LIKE '${ID_PREFIX}%';`);
  console.log(`Linhas em flood_points (${ID_PREFIX}*): ${out}`);
  if (Number(out) !== feats.length) throw new Error('Contagem em flood_points diverge da fonte');
} else if (opt.register) {
  psql(`INSERT INTO dataset_imports (source, file_hash, rows) VALUES ('${SOURCE}', '${sha256}', ${feats.length});`);
}

// 5) Fixture com ~5 feições reais em WGS84
if (opt.fixture) {
  const json = psql(`SELECT json_build_object('type','FeatureCollection',
    'note', 'Amostra real do WFS GeoSampa geoportal:risco_ocorrencia_alagamento, transformada de EPSG:31983 para EPSG:4326 via PostGIS ST_Transform. sha256 da fonte: ${sha256}',
    'features', json_agg(json_build_object('type','Feature',
      'geometry', ST_AsGeoJSON(geom, 6)::json,
      'properties', json_build_object('cd_identificador', cd_identificador, 'dt_ocorrencia', dt_ocorrencia,
        'dc_tipo_ocorrencia', dc_tipo_ocorrencia, 'nm_distrito', nm_distrito, 'nm_subprefeitura', nm_subprefeitura,
        'sg_fonte_original', sg_fonte_original, 'dt_carga', dt_carga,
        'utm_x', round(ST_X(geom_utm)::numeric, 3), 'utm_y', round(ST_Y(geom_utm)::numeric, 3)))
      ORDER BY dt_ocorrencia, cd_identificador))
    FROM (SELECT * FROM spike_flood_raw ORDER BY cd_identificador::bigint LIMIT 5) s;`);
  writeFileSync(resolve(opt.fixture), JSON.stringify(JSON.parse(json), null, 2) + '\n');
  console.log(`Fixture gravada em ${resolve(opt.fixture)}`);
}

if (!opt['keep-raw']) {
  psql('DROP TABLE IF EXISTS spike_flood_raw;');
  console.log('spike_flood_raw removida.');
}
