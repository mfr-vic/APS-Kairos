-- 001_init — schema base da Frente C.6 (equivalente a apps/api/database/init.sql).
--
-- Tudo é IF NOT EXISTS: num banco criado pelo docker compose (que monta o init.sql em
-- docker-entrypoint-initdb.d) esta migration não muda nada e só fica registrada em
-- schema_migrations. Num banco vazio sem o init.sql, ela cria o schema inteiro.

CREATE EXTENSION IF NOT EXISTS postgis;

-- Pontos históricos de alagamento (importação GeoSampa, RF20)
CREATE TABLE IF NOT EXISTS flood_points (
  id BIGSERIAL PRIMARY KEY,
  source_id VARCHAR(255),
  occurred_on DATE,
  address TEXT,
  geom GEOMETRY(Point, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_flood_points_geom ON flood_points USING GIST (geom);

-- Registro das importações (idempotência por hash do arquivo)
CREATE TABLE IF NOT EXISTS dataset_imports (
  id BIGSERIAL PRIMARY KEY,
  source VARCHAR(100),
  file_hash VARCHAR(64),
  rows INTEGER,
  imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Histórico de briefings (RF26, opcional)
CREATE TABLE IF NOT EXISTS briefing_log (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  route_hash VARCHAR(64),
  verdict VARCHAR(20),
  confidence VARCHAR(10),
  provider_status JSONB,
  latency_ms INTEGER
);
