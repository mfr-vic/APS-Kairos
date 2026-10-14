// Nível de trânsito (TrafficValue.nivel) pela razão duração atual / duração sem trânsito (RF22, B.8).
import type { TrafficLevel } from '@kairos/contracts';
import { TRANSITO_RAZAO_INTENSO_MAX, TRANSITO_RAZAO_LIVRE_MAX, TRANSITO_RAZAO_MODERADO_MAX } from './thresholds.js';

// Duração livre 0 (origem ≈ destino) ou inválida: sem base de comparação → LIVRE
export function classificarNivelTransito(duracaoAtualS: number, duracaoLivreS: number): TrafficLevel {
  if (!(duracaoLivreS > 0) || !Number.isFinite(duracaoAtualS)) return 'LIVRE';
  const razao = duracaoAtualS / duracaoLivreS;
  if (razao < TRANSITO_RAZAO_LIVRE_MAX) return 'LIVRE';
  if (razao < TRANSITO_RAZAO_MODERADO_MAX) return 'MODERADO';
  if (razao < TRANSITO_RAZAO_INTENSO_MAX) return 'INTENSO';
  return 'PARADO';
}

export const ROTULO_NIVEL_TRANSITO: Record<TrafficLevel, string> = {
  LIVRE: 'livre',
  MODERADO: 'moderado',
  INTENSO: 'intenso',
  PARADO: 'parado',
};
