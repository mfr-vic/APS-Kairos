// Faixa do ar exibida no app (AirValue.faixa), a partir da média de 24 h de MP2,5 (B.8). T24.
import type { AirQualityBand } from '@kairos/contracts';
import { FAIXAS_PM25_24H } from './thresholds.js';

// null quando ainda não há 24 h de dados (pm25Media24h = null)
export function classificarFaixaAr(pm25Media24h: number | null): AirQualityBand | null {
  if (pm25Media24h === null || !Number.isFinite(pm25Media24h)) return null;
  for (const { faixa, maxUgM3 } of FAIXAS_PM25_24H) {
    if (pm25Media24h <= maxUgM3) return faixa;
  }
  // Acima de 300 µg/m³ também conta como PESSIMA (decisão de projeto)
  return 'PESSIMA';
}

// Rótulo em pt-BR para os textos dos motivos
export const ROTULO_FAIXA_AR: Record<AirQualityBand, string> = {
  BOA: 'boa',
  MODERADA: 'moderada',
  RUIM: 'ruim',
  MUITO_RUIM: 'muito ruim',
  PESSIMA: 'péssima',
};
