// Dimensão `flood` (T27, RF10): o FloodRiskService (PostGIS, carga do GeoSampa) passa pelo ProviderRunner
// como as fontes externas. Assim o banco fora do ar vira `unavailable` (com breaker e cache), nunca 500.
import { createHash } from 'node:crypto';
import type { FloodValue } from '@kairos/contracts';
import type { DimensionProvider, ProviderFetchContext, ProviderResult } from '../../infrastructure/provider.js';
import type { Coordenada, FloodRiskService } from '../../modules/flood-risk/index.js';

export const GEOSAMPA_SOURCE = 'geosampa';

export class GeoSampaFloodAdapter implements DimensionProvider<Coordenada[], 'flood'> {
  readonly source = GEOSAMPA_SOURCE;
  readonly dimension = 'flood' as const;
  readonly ttlSeconds = 24 * 60 * 60; // carga em lote: o dado muda pouco (igual ao simulado)
  readonly timeoutMs = 3_000; // C.5
  readonly refreshAhead = true; // consulta local: renovar não custa nada às fontes externas

  constructor(private readonly service: Pick<FloodRiskService, 'pontosProximos'>) {}

  /** A geometria do OSRM pode ter milhares de pontos: a chave é um hash dela. */
  cacheKey(coordenadas: Coordenada[]): string {
    return createHash('sha1').update(JSON.stringify(coordenadas)).digest('hex');
  }

  async fetch(coordenadas: Coordenada[], _ctx: ProviderFetchContext): Promise<ProviderResult<FloodValue>> {
    return { value: await this.service.pontosProximos(coordenadas) };
  }
}
