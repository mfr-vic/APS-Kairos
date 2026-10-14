// SQL do histórico de briefings (T32, RF26, C.6). Período: created_at em [$1, $2] (timestamptz, migração 004).
// Dias contados em America/Sao_Paulo.

export const SQL_INSERIR_BRIEFING = `
  INSERT INTO briefing_log (created_at, route_hash, verdict, confidence, provider_status, latency_ms)
  VALUES ($1, $2, $3, $4, $5::jsonb, $6)`;

export const SQL_TOTAIS = `
  SELECT count(*)::int AS total,
         count(DISTINCT route_hash)::int AS distintos,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50,
         percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95,
         max(latency_ms) AS max
    FROM briefing_log
   WHERE created_at BETWEEN $1 AND $2`;

export const SQL_VEREDITOS_POR_DIA = `
  SELECT to_char(date_trunc('day', created_at, 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS dia,
         count(*) FILTER (WHERE verdict = 'FAVORAVEL')::int AS "FAVORAVEL",
         count(*) FILTER (WHERE verdict = 'ATENCAO')::int AS "ATENCAO",
         count(*) FILTER (WHERE verdict = 'AGUARDAR')::int AS "AGUARDAR",
         count(*) FILTER (WHERE verdict = 'INDETERMINADO')::int AS "INDETERMINADO"
    FROM briefing_log
   WHERE created_at BETWEEN $1 AND $2
   GROUP BY 1
   ORDER BY 1`;

export const SQL_DISPONIBILIDADE = `
  SELECT p->>'source' AS provedor,
         count(*)::int AS consultas,
         count(*) FILTER (WHERE p->>'status' = 'fresh')::int AS fresh,
         count(*) FILTER (WHERE p->>'status' = 'stale')::int AS stale,
         count(*) FILTER (WHERE p->>'status' = 'unavailable')::int AS unavailable
    FROM briefing_log, jsonb_array_elements(provider_status) AS p
   WHERE created_at BETWEEN $1 AND $2
   GROUP BY 1
   ORDER BY 1`;
