-- Kairos Database Initialization
-- Frente C.6 schema

-- Extensions
CREATE EXTENSION IF NOT EXISTS postgis;

-- Flood risk points (from GeoSampa import)
CREATE TABLE IF NOT EXISTS flood_points (
  id BIGSERIAL PRIMARY KEY,
  source_id VARCHAR(255),
  occurred_on DATE,
  address TEXT,
  geom GEOMETRY(Point, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_flood_points_geom ON flood_points USING GIST(geom);

-- Dataset import log (idempotency)
CREATE TABLE IF NOT EXISTS dataset_imports (
  id BIGSERIAL PRIMARY KEY,
  source VARCHAR(100),
  file_hash VARCHAR(64),
  rows INTEGER,
  imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Optional: Briefing log for RF26 (historical reports)
CREATE TABLE IF NOT EXISTS briefing_log (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  route_hash VARCHAR(64),
  verdict VARCHAR(20),
  confidence VARCHAR(10),
  provider_status JSONB,
  latency_ms INTEGER
);

-- Health check
SELECT 1 as status;
