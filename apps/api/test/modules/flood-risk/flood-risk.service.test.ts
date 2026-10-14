// Testes unitários do FloodRiskService (T23, RF10), sem banco: usam um dublê de `query`.

import { describe, expect, it } from 'vitest';
import { FloodValueSchema } from '@kairos/contracts';
import type { Queryable } from '../../../src/modules/flood-risk/db.js';
import {
  FloodRiskService,
  GeometriaInvalidaError,
  RAIO_ALAGAMENTO_M,
  geometriaGeoJson,
} from '../../../src/modules/flood-risk/flood-risk.service.js';

function dubleDb(rows: Record<string, unknown>[]) {
  const chamadas: { text: string; values?: unknown[] }[] = [];
  const db: Queryable = {
    async query(text, values) {
      chamadas.push({ text, values });
      return { rows: rows as never[], rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
    },
  };
  return { db, chamadas };
}

describe('geometriaGeoJson', () => {
  it('2 pontos viram LineString (linha reta), em [lon, lat]', () => {
    const g = JSON.parse(geometriaGeoJson([[-46.7, -23.8], [-46.6, -23.7]]));
    expect(g).toEqual({ type: 'LineString', coordinates: [[-46.7, -23.8], [-46.6, -23.7]] });
  });

  it('1 ponto vira Point', () => {
    expect(JSON.parse(geometriaGeoJson([[-46.5, -23.6]]))).toEqual({ type: 'Point', coordinates: [-46.5, -23.6] });
  });

  it('rejeita trajeto vazio ou ausente', () => {
    expect(() => geometriaGeoJson([])).toThrow(GeometriaInvalidaError);
    expect(() => geometriaGeoJson(undefined)).toThrow(GeometriaInvalidaError);
  });

  it('rejeita coordenada fora da faixa ou não finita', () => {
    expect(() => geometriaGeoJson([[-46.5, -123.6]])).toThrow(/coordenada 0/);
    expect(() => geometriaGeoJson([[0, 0], [Number.NaN, 0]])).toThrow(/coordenada 1/);
  });
});

describe('FloodRiskService', () => {
  it('usa raio de 300 m por padrão e passa geometria e raio como parâmetros (sem concatenar)', async () => {
    const { db, chamadas } = dubleDb([]);
    const r = await new FloodRiskService(db).pontosProximos([[-46.7, -23.8], [-46.6, -23.7]]);
    expect(RAIO_ALAGAMENTO_M).toBe(300);
    expect(r).toEqual({ raioM: 300, pontos: [] });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].values).toEqual([
      JSON.stringify({ type: 'LineString', coordinates: [[-46.7, -23.8], [-46.6, -23.7]] }),
      300,
    ]);
    expect(chamadas[0].text).toContain('ST_DWithin(fp.geom::geography, rota.g, $2::float8)');
    expect(chamadas[0].text).not.toContain('-46.7');
  });

  it('mapeia as linhas para FloodValue válido, mantendo a ordem do banco e arredondando a distância', async () => {
    const { db } = dubleDb([
      { source_id: 'geosampa:alagamento:19', occurred_on: '2026-01-04', address: 'PA - PARELHEIROS', distancia_m: 99.84 },
      { source_id: 'geosampa:alagamento:28', occurred_on: null, address: null, distancia_m: '250.06' },
    ]);
    const r = await new FloodRiskService(db).pontosProximos([[-46.7, -23.8], [-46.6, -23.7]]);
    expect(FloodValueSchema.parse(r)).toEqual(r);
    expect(r.pontos).toEqual([
      { sourceId: 'geosampa:alagamento:19', distanciaM: 99.8, ocorridoEm: '2026-01-04', local: 'PA - PARELHEIROS' },
      { sourceId: 'geosampa:alagamento:28', distanciaM: 250.1, ocorridoEm: null, local: null },
    ]);
  });

  it('não consulta o banco se a geometria for inválida', async () => {
    const { db, chamadas } = dubleDb([]);
    await expect(new FloodRiskService(db).pontosProximos([])).rejects.toBeInstanceOf(GeometriaInvalidaError);
    expect(chamadas).toHaveLength(0);
  });

  it('rejeita raio não positivo', () => {
    const { db } = dubleDb([]);
    expect(() => new FloodRiskService(db, 0)).toThrow(/raio/);
  });
});
