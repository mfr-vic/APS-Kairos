// Testes unitários da transformação do GeoJSON do WFS GeoSampa e da lista de migrations (T22).
// Os dados vêm da fixture real do spike T07 (spikes/geosampa/fixture.json), remontada como a
// resposta do WFS: coordenadas UTM originais (utm_x/utm_y) e crs EPSG:31983.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PREFIXO_SOURCE_ID,
  hashConteudo,
  transformarGeoJson,
} from '../../../../database/scripts/lib/geosampa.js';
import { listarMigrations } from '../../../../database/scripts/lib/migrations.js';

interface FeicaoFixture {
  properties: Record<string, unknown> & { utm_x: number; utm_y: number };
}

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../../../../spikes/geosampa/fixture.json', import.meta.url)), 'utf8'),
) as { features: FeicaoFixture[] };

function respostaWfs(extra: Record<string, unknown> = {}) {
  const features = fixture.features.map((f, i) => {
    const { utm_x, utm_y, ...props } = f.properties;
    return {
      type: 'Feature',
      id: `risco_ocorrencia_alagamento.${i + 1}`,
      geometry: { type: 'Point', coordinates: [utm_x, utm_y] },
      geometry_name: 'ge_ponto',
      properties: { ...props, dt_ocorrencia: `${props.dt_ocorrencia}Z` } as Record<string, unknown>,
    };
  });
  return {
    type: 'FeatureCollection',
    features,
    totalFeatures: features.length,
    numberMatched: features.length,
    numberReturned: features.length,
    timeStamp: '2026-10-10T17:41:14.744Z',
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::31983' } },
    ...extra,
  };
}

describe('transformarGeoJson', () => {
  it('mapeia cd_identificador, dt_ocorrencia (sem Z), nm_subprefeitura e mantém as coordenadas UTM', () => {
    const linhas = transformarGeoJson(JSON.stringify(respostaWfs()));
    expect(linhas).toHaveLength(5);
    expect(linhas[0]).toEqual({
      sourceId: `${PREFIXO_SOURCE_ID}19`,
      ocorridoEm: '2026-01-04',
      endereco: 'PA - PARELHEIROS',
      x: 326568.733,
      y: 7364698.818,
    });
  });

  it('rejeita CRS diferente de EPSG:31983', () => {
    const fc = respostaWfs({ crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::4326' } } });
    expect(() => transformarGeoJson(JSON.stringify(fc))).toThrow(/CRS inesperado/);
  });

  it('rejeita resposta truncada (numberMatched != features)', () => {
    expect(() => transformarGeoJson(JSON.stringify(respostaWfs({ numberMatched: 292 })))).toThrow(/truncada/);
  });

  it('rejeita cd_identificador repetido', () => {
    const fc = respostaWfs();
    fc.features[1].properties.cd_identificador = fc.features[0].properties.cd_identificador;
    expect(() => transformarGeoJson(JSON.stringify(fc))).toThrow(/repetido/);
  });
});

describe('hashConteudo', () => {
  it('ignora o timeStamp do WFS, mas muda se as feições mudarem', () => {
    const a = hashConteudo(JSON.stringify(respostaWfs()));
    const b = hashConteudo(JSON.stringify(respostaWfs({ timeStamp: '2026-10-10T17:41:23.885Z' })));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toBe(a);
    const fc = respostaWfs();
    fc.features[0].properties.nm_subprefeitura = 'OUTRA';
    expect(hashConteudo(JSON.stringify(fc))).not.toBe(a);
  });
});

describe('listarMigrations', () => {
  it('encontra as migrations em ordem, com checksum', () => {
    const ms = listarMigrations();
    expect(ms.map((m) => m.arquivo)).toEqual([
      '001_init.sql',
      '002_flood_points_source_id_unique.sql',
      '003_flood_points_geography_index.sql',
      '004_briefing_log_created_at.sql',
    ]);
    for (const m of ms) expect(m.checksum).toMatch(/^[0-9a-f]{64}$/);
  });
});
