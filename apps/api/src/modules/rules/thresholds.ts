// Limiares das regras de negócio (B.8, revisada na T10 em 10/10/2026). T24/T25.
// Cada constante cita a regra e a origem: [REF 1] AMS, [REF 2] CONAMA 506/2024,
// [REF 3] IQAr MMA, ou "decisão de projeto". Referências conferidas em B.8.1.
import type { AirQualityBand } from '@kairos/contracts';

// --- Chuva (precipitação horária da Open-Meteo = soma da hora anterior ao carimbo, 0,1 mm) ---
// Todas as comparações de chuva usam ">" (B.8, convenções).

// RN02, RN03, RN04 e janela meteorológica: 2,5 mm/h = 0,25 cm/h, limite superior da chuva
// "fraca" da AMS [REF 1]. "> 2,5" equivale a "≥ 2,6" com resolução de 0,1 mm.
export const CHUVA_FRACA_MAX_MM_H = 2.5;

// RN01/RN02: 7,6 mm/h = 0,76 cm/h, limite superior da chuva "moderada" da AMS [REF 1].
// "> 7,6" (chuva forte) equivale a "≥ 7,7".
export const CHUVA_MODERADA_MAX_MM_H = 7.6;

// RN01–RN04: horizonte de chuva = carimbos em (agora, agora + 2 h]. Decisão de projeto.
export const HORIZONTE_CHUVA_H = 2;

// --- Alagamento ---

// RN03/RN04: ponto histórico de alagamento a ≤ 300 m da geometria do trajeto.
// Decisão de projeto (mesmo buffer do fallback em linha reta, ADR-13).
export const RAIO_ALAGAMENTO_M = 300;

// --- Qualidade do ar (média de 24 h de MP2,5, CAMS via Open-Meteo) ---

// RN05: > 50 µg/m³ = início da faixa N3 – Ruim do IQAr atualizado [REF 3]; coincide com o
// padrão PI-2 de MP2,5 em 24 h da Res. CONAMA 506/2024 [REF 2]. Usar a média de 24 h do
// modelo CAMS no lugar da medição de estação é decisão de projeto.
export const PM25_24H_RN05_UG_M3 = 50;

// Faixas exibidas no app (AirValue.faixa), IQAr atualizado do MMA [REF 3]; N1 também no
// Anexo II da CONAMA 506/2024 [REF 2]. Cada faixa vale até o limite inclusive ("> anterior – ≤ max").
// Acima de 300 µg/m³ também é PESSIMA: decisão de projeto.
export const FAIXAS_PM25_24H: readonly { faixa: AirQualityBand; maxUgM3: number }[] = [
  { faixa: 'BOA', maxUgM3: 15 }, // N1: 0–15
  { faixa: 'MODERADA', maxUgM3: 50 }, // N2: > 15–50
  { faixa: 'RUIM', maxUgM3: 75 }, // N3: > 50–75
  { faixa: 'MUITO_RUIM', maxUgM3: 125 }, // N4: > 75–125
  { faixa: 'PESSIMA', maxUgM3: 300 }, // N5: > 125–300 (e acima, decisão de projeto)
];

// --- Transporte ---

// RN07: espera > 20 min (ou sem previsão) gera ATENÇÃO. Decisão de projeto; a amostra do T04
// (875A-10, 13 min) não é base estatística.
export const ESPERA_ONIBUS_MAX_MIN = 20;

// --- Trânsito (RF22 reaberto em 14/10/2026, TomTom) ---

// Nível pela razão duração com trânsito / duração sem trânsito da mesma rota. Decisão de projeto: a TomTom
// não publica faixas para essa razão; os cortes equivalem a velocidade média ≥ 87 % (LIVRE), ≥ 67 %
// (MODERADO), ≥ 50 % (INTENSO) e < 50 % (PARADO) da velocidade de fluxo livre. Cada nível vale abaixo do corte.
export const TRANSITO_RAZAO_LIVRE_MAX = 1.15;
export const TRANSITO_RAZAO_MODERADO_MAX = 1.5;
export const TRANSITO_RAZAO_INTENSO_MAX = 2.0;

// RN09: atraso por trânsito ≥ 15 min (ou nível INTENSO/PARADO). Decisão de projeto.
export const ATRASO_TRANSITO_RN09_MIN = 15;

// --- Janela meteorológica (RF14) ---

// Horizonte da janela: carimbos em (agora, agora + 6 h]. Decisão de projeto.
export const HORIZONTE_JANELA_H = 6;

// A janela aceita no máximo chuva fraca (≤ 2,5 mm/h) [REF 1]; regra da janela é decisão de projeto.
export const JANELA_CHUVA_MAX_MM_H = CHUVA_FRACA_MAX_MM_H;
