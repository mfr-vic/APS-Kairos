// Todos os pontos históricos de alagamento (carga do GeoSampa) para a camada do mapa (RF23).
// geom é Point em EPSG:4326 (migration 001): ST_Y = lat, ST_X = lon.
export const SQL_TODOS_OS_PONTOS = `
SELECT source_id,
       occurred_on::text AS occurred_on,
       address,
       ST_Y(geom) AS lat,
       ST_X(geom) AS lon
  FROM flood_points
 ORDER BY source_id
`;

export interface LinhaPontoMapa {
  [coluna: string]: unknown;
  source_id: string | null;
  occurred_on: string | null;
  address: string | null;
  lat: number;
  lon: number;
}
