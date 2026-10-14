-- 002 — UNIQUE(source_id) em flood_points (recomendação do spike T07, aceita pelo grupo).
-- Permite o upsert por source_id na importação GeoSampa (ON CONFLICT (source_id)).
-- Idempotente: só cria a restrição se ela ainda não existir.
-- Observação: falha se já houver source_id duplicado; nesse caso, limpe as duplicatas antes.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'flood_points'::regclass AND conname = 'flood_points_source_id_key'
  ) THEN
    ALTER TABLE flood_points ADD CONSTRAINT flood_points_source_id_key UNIQUE (source_id);
  END IF;
END
$$;
