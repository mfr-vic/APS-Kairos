// Testes de integração contra o PostGIS real (TC10 e verificações do TC11).
// São PULADOS automaticamente se o banco não responder ou se o GeoSampa ainda não foi importado,
// para que `npm test` não falhe em máquina sem Docker. Pré-condição: `npm run db:import-geosampa`.
// Credenciais: DB_* do ambiente; se DB_PASSWORD não estiver no ambiente, lê o .env da raiz.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { FloodValueSchema } from '@kairos/contracts';
import { criarPool } from '../../../src/modules/flood-risk/db.js';
import { FloodRiskService, type Coordenada } from '../../../src/modules/flood-risk/flood-risk.service.js';

const envRaiz = fileURLToPath(new URL('../../../../../.env', import.meta.url));
if (!process.env.DB_PASSWORD && existsSync(envRaiz)) process.loadEnvFile(envRaiz);

const pool = criarPool(process.env, { connectionTimeoutMillis: 5000, max: 2 });

async function verificarBanco(): Promise<string | null> {
  try {
    const { rows } = await pool.query<{ n: string }>(
      "SELECT count(*) AS n FROM flood_points WHERE starts_with(source_id, 'geosampa:alagamento:')",
    );
    return Number(rows[0].n) > 0 ? null : 'GeoSampa ainda não importado (rode npm run db:import-geosampa)';
  } catch (err) {
    return `banco inacessível: ${(err as Error).message}`;
  }
}

const motivoPular = await verificarBanco();
if (motivoPular) console.warn(`[flood-risk.integration] testes pulados: ${motivoPular}`);

afterAll(() => pool.end());

// Ponto real 19 da fixture do spike T07 (Parelheiros), já em WGS84. É o ponto mais ao sul da base.
const P19: Coordenada = [-46.702602, -23.819657];
// Ponto real 1458 verificado no spike T07 (Vila Prudente).
const P1458: Coordenada = [-46.536821, -23.606216];

/** Linha leste-oeste de ~600 m, deslocada `dLat` graus em latitude do ponto. */
function linhaHorizontal([lon, lat]: Coordenada, dLat: number): Coordenada[] {
  return [
    [lon - 0.003, lat + dLat],
    [lon + 0.003, lat + dLat],
  ];
}

async function distanciaDireta(ponto: Coordenada, rota: Coordenada[]): Promise<number> {
  const { rows } = await pool.query<{ d: number }>(
    `SELECT ST_Distance(
              ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
              ST_SetSRID(ST_GeomFromGeoJSON($3), 4326)::geography) AS d`,
    [ponto[0], ponto[1], JSON.stringify({ type: 'LineString', coordinates: rota })],
  );
  return Number(rows[0].d);
}

describe.skipIf(motivoPular !== null)('TC10 — FloodRiskService contra o PostGIS', () => {
  const servico = new FloodRiskService(pool);

  it('trajeto a ~100 m do ponto 19 traz o ponto, com distância coerente (±10 m do ST_Distance direto)', async () => {
    const rota = linhaHorizontal(P19, 0.0009); // ~100 m ao norte
    const r = await servico.pontosProximos(rota);
    expect(FloodValueSchema.parse(r)).toEqual(r);
    expect(r.raioM).toBe(300);

    const p = r.pontos.find((x) => x.sourceId === 'geosampa:alagamento:19');
    expect(p).toBeDefined();
    expect(p?.ocorridoEm).toBe('2026-01-04');
    expect(p?.local).toBe('PA - PARELHEIROS');

    const direta = await distanciaDireta(P19, rota);
    expect(direta).toBeGreaterThan(90);
    expect(direta).toBeLessThan(110);
    expect(Math.abs((p?.distanciaM ?? -1) - direta)).toBeLessThanOrEqual(10);

    // ordenação por distância e todos dentro do raio
    const ds = r.pontos.map((x) => x.distanciaM);
    expect(ds).toEqual([...ds].sort((a, b) => a - b));
    expect(Math.max(...ds)).toBeLessThanOrEqual(300);
  });

  it('trajeto a ~1,1 km ao sul do ponto 19 não traz o ponto 19 (nem outro, pois 19 é o mais ao sul)', async () => {
    const rota = linhaHorizontal(P19, -0.01);
    expect(await distanciaDireta(P19, rota)).toBeGreaterThan(300);
    const r = await servico.pontosProximos(rota);
    expect(r.pontos.find((x) => x.sourceId === 'geosampa:alagamento:19')).toBeUndefined();
    expect(r.pontos).toEqual([]);
  });

  it('linha reta (2 pontos) passando sobre o ponto 1458 o traz com distância < 1 m', async () => {
    const rota: Coordenada[] = [
      [P1458[0] - 0.01, P1458[1]],
      [P1458[0] + 0.01, P1458[1]],
    ];
    const r = await servico.pontosProximos(rota);
    const p = r.pontos.find((x) => x.sourceId === 'geosampa:alagamento:1458');
    expect(p).toBeDefined();
    expect(p?.distanciaM).toBeLessThan(1);
    expect(r.pontos[0].distanciaM).toBeLessThan(1);
  });
});

describe.skipIf(motivoPular !== null)('TC11 — estado do banco após a importação', () => {
  it('índice GiST existe, source_id é único e a contagem bate com a última importação registrada', async () => {
    const gist = await pool.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'flood_points' AND indexdef ILIKE '%USING gist%'",
    );
    expect(gist.rows.map((r) => r.indexname)).toContain('idx_flood_points_geom');

    const unico = await pool.query(
      "SELECT 1 FROM pg_constraint WHERE conrelid = 'flood_points'::regclass AND contype = 'u' AND conname = 'flood_points_source_id_key'",
    );
    expect(unico.rows).toHaveLength(1);

    const { rows } = await pool.query<{ total: string; distintos: string; ultima: number }>(
      `SELECT (SELECT count(*) FROM flood_points WHERE starts_with(source_id, 'geosampa:alagamento:')) AS total,
              (SELECT count(DISTINCT source_id) FROM flood_points WHERE starts_with(source_id, 'geosampa:alagamento:')) AS distintos,
              (SELECT rows FROM dataset_imports WHERE source = 'geosampa_alagamento' ORDER BY id DESC LIMIT 1) AS ultima`,
    );
    expect(Number(rows[0].total)).toBe(rows[0].ultima);
    expect(Number(rows[0].distintos)).toBe(Number(rows[0].total));
  });

  it('o ponto 19 no banco está a < 1 m da coordenada da fixture do spike', async () => {
    const { rows } = await pool.query<{ d: number }>(
      `SELECT ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS d
         FROM flood_points WHERE source_id = 'geosampa:alagamento:19'`,
      [P19[0], P19[1]],
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].d)).toBeLessThan(1);
  });
});
