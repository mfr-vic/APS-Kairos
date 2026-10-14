// Resposta de exemplo de GET /v1/reports/summary (contrato 1.6.0). Valores inventados SÓ para teste
// de render; os testes conferem que ela passa no schema.
import type { ReportsSummaryResponse } from '@kairos/contracts';

export const RELATORIO_EXEMPLO: ReportsSummaryResponse = {
  periodo: { inicio: '2026-10-08T03:00:00.000Z', fim: '2026-10-15T03:00:00.000Z', dias: 7 },
  totalBriefings: 9,
  trajetosDistintos: 2,
  vereditosPorDia: [
    { dia: '2026-10-12', FAVORAVEL: 3, ATENCAO: 1, AGUARDAR: 0, INDETERMINADO: 0 },
    { dia: '2026-10-13', FAVORAVEL: 0, ATENCAO: 0, AGUARDAR: 0, INDETERMINADO: 0 },
    { dia: '2026-10-14', FAVORAVEL: 2, ATENCAO: 0, AGUARDAR: 2, INDETERMINADO: 1 },
  ],
  disponibilidadePorProvedor: [
    { provedor: 'open-meteo', consultas: 9, fresh: 8, stale: 1, unavailable: 0, disponibilidadePct: 100 },
    { provedor: 'metro-sp', consultas: 4, fresh: 3, stale: 0, unavailable: 1, disponibilidadePct: 75 },
    { provedor: 'artesp', consultas: 0, fresh: 0, stale: 0, unavailable: 0, disponibilidadePct: null },
  ],
  latenciaMs: { p50: 1100, p95: 2400, max: 3900 },
};

export const RELATORIO_VAZIO: ReportsSummaryResponse = {
  ...RELATORIO_EXEMPLO,
  totalBriefings: 0,
  trajetosDistintos: 0,
  vereditosPorDia: [],
  disponibilidadePorProvedor: [],
  latenciaMs: null,
};
