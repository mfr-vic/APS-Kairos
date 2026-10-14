// SQL do FloodRiskService (RF10, C.6). Só parâmetros posicionais; nenhum valor é concatenado.
//   $1 = geometria do trajeto em GeoJSON (texto), EPSG:4326, [lon, lat]
//   $2 = raio em metros
// A distância é calculada em `geography`, ou seja, em metros reais sobre o elipsoide.
// O filtro usa exatamente a expressão da C.6, que casa com o índice idx_flood_points_geog (migration 003).

export const SQL_PONTOS_PROXIMOS = `
WITH rota AS (
  SELECT ST_SetSRID(ST_GeomFromGeoJSON($1::text), 4326)::geography AS g
)
SELECT fp.source_id,
       fp.occurred_on::text AS occurred_on,
       fp.address,
       ST_Distance(fp.geom::geography, rota.g) AS distancia_m
  FROM flood_points fp, rota
 WHERE ST_DWithin(fp.geom::geography, rota.g, $2::float8)
 ORDER BY distancia_m, fp.source_id
`;

export interface LinhaPontoProximo {
  [coluna: string]: unknown;
  source_id: string | null;
  occurred_on: string | null;
  address: string | null;
  distancia_m: number;
}
