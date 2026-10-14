// FloodRiskService (T23, RF10): pontos históricos de alagamento a ≤ raio (300 m, RN03/RN04)
// da geometria do trajeto. A combinação com a chuva prevista (RN03 x RN04) é das regras, não daqui.

import type { FloodValue } from '@kairos/contracts';
import type { Queryable } from './db.js';
import { SQL_PONTOS_PROXIMOS, type LinhaPontoProximo } from './flood-risk.sql.js';

/** Raio padrão da RN03/RN04 (B.8) e da C.6, em metros. */
export const RAIO_ALAGAMENTO_M = 300;

/** Coordenada [lon, lat] em EPSG:4326, como em GeometrySchema.coordenadas. */
export type Coordenada = [number, number];

export class GeometriaInvalidaError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'GeometriaInvalidaError';
  }
}

/**
 * Converte a lista de coordenadas em GeoJSON. Um ponto vira Point; dois ou mais viram
 * LineString (com 2 pontos é a linha reta do fallback, ADR-13).
 */
export function geometriaGeoJson(coordenadas: readonly Coordenada[] | undefined): string {
  if (!coordenadas || coordenadas.length === 0) {
    throw new GeometriaInvalidaError('trajeto sem coordenadas');
  }
  coordenadas.forEach(([lon, lat], i) => {
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      throw new GeometriaInvalidaError(`coordenada ${i} inválida: [${lon}, ${lat}] (esperado [lon, lat])`);
    }
  });
  const pares = coordenadas.map(([lon, lat]) => [lon, lat]);
  return coordenadas.length === 1
    ? JSON.stringify({ type: 'Point', coordinates: pares[0] })
    : JSON.stringify({ type: 'LineString', coordinates: pares });
}

export class FloodRiskService {
  constructor(
    private readonly db: Queryable,
    private readonly raioM: number = RAIO_ALAGAMENTO_M,
  ) {
    if (!(raioM > 0)) throw new Error(`raio inválido: ${raioM}`);
  }

  /** Pontos a ≤ raioM do trajeto, ordenados por distância (metros, 1 casa decimal). */
  async pontosProximos(coordenadas: readonly Coordenada[] | undefined): Promise<FloodValue> {
    const geojson = geometriaGeoJson(coordenadas);
    const { rows } = await this.db.query<LinhaPontoProximo>(SQL_PONTOS_PROXIMOS, [geojson, this.raioM]);
    return {
      raioM: this.raioM,
      pontos: rows.map((r) => ({
        sourceId: r.source_id ?? '',
        distanciaM: Math.round(Number(r.distancia_m) * 10) / 10,
        ocorridoEm: r.occurred_on,
        local: r.address,
      })),
    };
  }
}
