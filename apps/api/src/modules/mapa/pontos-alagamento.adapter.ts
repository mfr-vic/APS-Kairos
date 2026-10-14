// Camada de alagamento do mapa (RF23): os pontos REAIS do PostGIS, pelo runner como as outras fontes
// (banco fora → `unavailable` com motivo, nunca 500). São ~300 linhas: sem bbox nem paginação.
import type { MapaPontoAlagamento } from '@kairos/contracts';
import type { Provider, ProviderFetchContext, ProviderResult } from '../../infrastructure/provider.js';
import type { Queryable } from '../flood-risk/index.js';
import { GEOSAMPA_SOURCE } from '../../providers/flood/geosampa-flood.adapter.js';
import { SQL_TODOS_OS_PONTOS, type LinhaPontoMapa } from './pontos-alagamento.sql.js';

export class PontosAlagamentoAdapter implements Provider<void, MapaPontoAlagamento[]> {
  readonly source = GEOSAMPA_SOURCE;
  readonly ttlSeconds = 24 * 60 * 60; // carga em lote (igual à dimensão flood)
  readonly timeoutMs = 3_000;
  readonly refreshAhead = true; // consulta local

  constructor(private readonly db: Queryable) {}

  cacheKey(): string {
    return 'mapa-todos';
  }

  async fetch(_: void, _ctx: ProviderFetchContext): Promise<ProviderResult<MapaPontoAlagamento[]>> {
    const { rows } = await this.db.query<LinhaPontoMapa>(SQL_TODOS_OS_PONTOS);
    return {
      value: rows.map((r) => ({
        sourceId: r.source_id ?? '',
        lat: Number(r.lat),
        lon: Number(r.lon),
        ocorridoEm: r.occurred_on,
        local: r.address,
      })),
    };
  }
}
