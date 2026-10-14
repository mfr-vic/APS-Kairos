// RF22 (reaberto em 14/10/2026): leituras do trânsito do trajeto (TomTom) em linguagem do app.
// Funções puras; quem decide o veredito é o servidor (RN09). Aqui só se descreve.
import type { TrafficLevel, TrafficValue } from '@kairos/contracts';

import type { Tom } from '@/theme';

import { ATRASO_TRANSITO_MIN } from './limiares';

/** Tom de cada nível: o trânsito nunca passa de Atenção no veredito (RN09), então PARADO não usa a cor de Aguardar. */
export const NIVEL_TRANSITO: Record<TrafficLevel, { rotulo: string; tom: Tom }> = {
  LIVRE: { rotulo: 'Livre', tom: 'ok' },
  MODERADO: { rotulo: 'Moderado', tom: 'neutro' },
  INTENSO: { rotulo: 'Intenso', tom: 'atencao' },
  PARADO: { rotulo: 'Parado', tom: 'atencao' },
};

/** magnitudeOfDelay da TomTom (contrato 1.5.0). */
export const MAGNITUDE_TRECHO = ['lentidão sem classificação', 'lentidão leve', 'lentidão moderada', 'lentidão intensa', 'trecho bloqueado ou sem estimativa'] as const;

/** "1 min", "22 min", "1 h", "1 h 05 min". */
export function formatarDuracao(s: number): string {
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto === 0 ? `${h} h` : `${h} h ${String(resto).padStart(2, '0')} min`;
}

/** Atraso em minutos inteiros (0 abaixo de 30 s). */
export function atrasoMin(t: Pick<TrafficValue, 'atrasoS'>): number {
  return Math.round(t.atrasoS / 60);
}

/** "+6 min" ou "sem atraso". */
export function textoAtraso(t: Pick<TrafficValue, 'atrasoS'>): string {
  const m = atrasoMin(t);
  return m === 0 ? 'sem atraso' : `+${formatarDuracao(t.atrasoS)}`;
}

/** Mesmo critério da RN09 no servidor (atraso ≥ 15 min ou nível intenso/parado). */
export function transitoPesado(t: Pick<TrafficValue, 'atrasoS' | 'nivel'>): boolean {
  return t.nivel === 'INTENSO' || t.nivel === 'PARADO' || t.atrasoS >= ATRASO_TRANSITO_MIN * 60;
}

/** "34 min agora · 22 min sem trânsito". */
export function temposDoTransito(t: Pick<TrafficValue, 'duracaoAtualS' | 'duracaoLivreS'>): string {
  return `${formatarDuracao(t.duracaoAtualS)} agora · ${formatarDuracao(t.duracaoLivreS)} sem trânsito`;
}
