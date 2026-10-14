// GET /v1/reports/summary?dias=N (RF26, contrato 1.6.0): agregados do histórico de briefings.
import { ReportsSummaryResponseSchema, type ReportsSummaryResponse } from '@kairos/contracts';

import { requisitar } from './client';

export type PeriodoRelatorio = 7 | 30;

export const chaveRelatorio = (dias: PeriodoRelatorio) => ['relatorio', dias] as const;

export function buscarRelatorio(dias: PeriodoRelatorio, signal?: AbortSignal): Promise<ReportsSummaryResponse> {
  return requisitar(`/v1/reports/summary?dias=${dias}`, ReportsSummaryResponseSchema, { signal });
}
