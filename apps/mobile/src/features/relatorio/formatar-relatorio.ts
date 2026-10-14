// RF26: formatação dos números do relatório (funções puras).
import type { ReportsSummaryResponse, Verdict } from '@kairos/contracts';

import { VEREDITO } from '@/features/briefing/format';
import type { Tom } from '@/theme';

export type DiaRelatorio = ReportsSummaryResponse['vereditosPorDia'][number];

/** De baixo para cima nas barras empilhadas. */
export const ORDEM_VEREDITOS: Verdict[] = ['FAVORAVEL', 'ATENCAO', 'AGUARDAR', 'INDETERMINADO'];

/** "2026-10-14" → "14/10" (a data já vem no fuso de São Paulo). */
export function diaCurto(dia: string): string {
  const [, mes, d] = dia.split('-');
  return `${d}/${mes}`;
}

export function totalDoDia(d: DiaRelatorio): number {
  return ORDEM_VEREDITOS.reduce((s, v) => s + d[v], 0);
}

/** "14/10: 3 Favorável, 1 Atenção" (só os vereditos que aconteceram). */
export function resumoDoDia(d: DiaRelatorio): string {
  const partes = ORDEM_VEREDITOS.filter((v) => d[v] > 0).map((v) => `${d[v]} ${VEREDITO[v].rotulo}`);
  return `${diaCurto(d.dia)}: ${partes.length ? partes.join(', ') : 'nenhum briefing'}`;
}

/** 99.53 → "99,5%"; 100 → "100%"; null → "sem consultas". */
export function porcentagem(pct: number | null): string {
  if (pct === null) return 'sem consultas';
  const arred = Math.round(pct * 10) / 10;
  return `${Number.isInteger(arred) ? arred : arred.toFixed(1).replace('.', ',')}%`;
}

/** Disponibilidade ≥ 99 % ok; ≥ 90 % atenção; abaixo disso, erro (decisão de projeto, só visual). */
export function tomDaDisponibilidade(pct: number | null): Tom {
  if (pct === null) return 'neutro';
  return pct >= 99 ? 'ok' : pct >= 90 ? 'atencao' : 'erro';
}
