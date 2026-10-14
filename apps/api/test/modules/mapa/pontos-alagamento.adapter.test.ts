// Camada de alagamento do mapa: todos os pontos do banco, sem rede (banco falso; o SQL real roda no
// container e é conferido ao vivo em GET /v1/mapa/camadas).
import { describe, expect, it } from 'vitest';
import { MapaPontoAlagamentoSchema } from '@kairos/contracts';
import type { Queryable } from '../../../src/modules/flood-risk/index.js';
import { PontosAlagamentoAdapter } from '../../../src/modules/mapa/pontos-alagamento.adapter.js';
import { SQL_TODOS_OS_PONTOS } from '../../../src/modules/mapa/pontos-alagamento.sql.js';

function bancoFalso(rows: unknown[]): Queryable & { sql: string[] } {
  const sql: string[] = [];
  return {
    sql,
    query: (async (text: string) => {
      sql.push(text);
      return { rows };
    }) as unknown as Queryable['query'],
  };
}

describe('PontosAlagamentoAdapter', () => {
  it('converte as linhas do banco (lat/lon numéricos) para o contrato', async () => {
    // Ponto real 19 do GeoSampa (spike T07)
    const db = bancoFalso([
      { source_id: 'geosampa:alagamento:19', occurred_on: '2026-01-04', address: 'PA - PARELHEIROS', lat: '-23.819657', lon: -46.702602 },
      { source_id: null, occurred_on: null, address: null, lat: -23.6, lon: -46.5 },
    ]);
    const r = await new PontosAlagamentoAdapter(db).fetch(undefined, { signal: new AbortController().signal });
    expect(db.sql).toEqual([SQL_TODOS_OS_PONTOS]);
    expect(r.value[0]).toEqual({
      sourceId: 'geosampa:alagamento:19',
      lat: -23.819657,
      lon: -46.702602,
      ocorridoEm: '2026-01-04',
      local: 'PA - PARELHEIROS',
    });
    expect(r.value.map((p) => MapaPontoAlagamentoSchema.safeParse(p).success)).toEqual([true, true]);
  });

  it('banco fora: lança (o runner transforma em unavailable)', async () => {
    const db: Queryable = { query: (async () => { throw new Error('ECONNREFUSED'); }) as unknown as Queryable['query'] };
    await expect(new PontosAlagamentoAdapter(db).fetch(undefined, { signal: new AbortController().signal })).rejects.toThrow('ECONNREFUSED');
  });
});
