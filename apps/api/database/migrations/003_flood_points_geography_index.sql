-- 003 — índice GiST de expressão sobre geom::geography.
-- A consulta do FloodRiskService segue a C.6: ST_DWithin(geom::geography, rota::geography, 300).
-- O índice idx_flood_points_geom (geometry) não serve para essa expressão; este serve.
-- Com 292 pontos a diferença é pequena, mas evita varredura sequencial se a base crescer.

CREATE INDEX IF NOT EXISTS idx_flood_points_geog ON flood_points USING GIST ((geom::geography));
