-- 004_briefing_log_created_at — histórico de briefings (T32, RF26).
--
-- created_at vira TIMESTAMPTZ (o 001 criou TIMESTAMP sem fuso, que dependeria do fuso da sessão) para o
-- relatório agrupar por dia em America/Sao_Paulo; valores antigos são lidos como UTC (fuso do container).
-- Índice em created_at: todas as consultas do relatório filtram pelo período.
-- Idempotente: só converte se a coluna ainda for TIMESTAMP sem fuso.

DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
       WHERE table_name = 'briefing_log' AND column_name = 'created_at') = 'timestamp without time zone' THEN
    ALTER TABLE briefing_log ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
    ALTER TABLE briefing_log ALTER COLUMN created_at SET DEFAULT now();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_briefing_log_created_at ON briefing_log (created_at);
