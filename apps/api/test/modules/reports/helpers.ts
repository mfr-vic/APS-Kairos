// Apoio aos testes do relatório (T32): banco falso que guarda as consultas e responde por SQL.
import type { QueryResult, QueryResultRow } from 'pg';
import type { Queryable } from '../../../src/modules/flood-risk/index.js';
import { SQL_DISPONIBILIDADE, SQL_TOTAIS, SQL_VEREDITOS_POR_DIA } from '../../../src/modules/reports/reports.sql.js';

export interface Respostas {
  totais?: QueryResultRow[];
  porDia?: QueryResultRow[];
  provedores?: QueryResultRow[];
}

export function bancoFalso(r: Respostas = {}) {
  const chamadas: { sql: string; valores: unknown[] }[] = [];
  const db: Queryable = {
    query: async <R extends QueryResultRow>(sql: string, valores: unknown[] = []) => {
      chamadas.push({ sql, valores });
      const rows =
        sql === SQL_TOTAIS
          ? (r.totais ?? [{ total: 0, distintos: 0, p50: null, p95: null, max: null }])
          : sql === SQL_VEREDITOS_POR_DIA
            ? (r.porDia ?? [])
            : sql === SQL_DISPONIBILIDADE
              ? (r.provedores ?? [])
              : [];
      return { rows, rowCount: rows.length } as unknown as QueryResult<R>;
    },
  };
  return { db, chamadas };
}
