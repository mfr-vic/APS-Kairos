// Limiares da B.8 da especificação, usados pelo app para explicar e recomendar (as regras que
// decidem o veredito rodam no servidor, RN01–RN08). Um lugar só: alertas, sinais e recomendações.
export const CHUVA_MODERADA_MM = 2.5; // AMS: > 2,5 mm/h = moderada (RN02, Atenção)
export const CHUVA_FORTE_MM = 7.6; // AMS: > 7,6 mm/h = forte (RN01, Aguardar)
export const PM25_RUIM = 50; // IQAr/MMA N3: média 24 h de MP2,5 > 50 µg/m³ (RN05)
export const ONIBUS_DEMORANDO_MIN = 20; // RN07
/** RN09 (RF22, 14/10/2026): atraso por trânsito ≥ 15 min ou nível INTENSO/PARADO. */
export const ATRASO_TRANSITO_MIN = 15;
/** Horizonte das regras de chuva (RN01/RN02/RN03): agora + 2 horas seguintes. */
export const HORIZONTE_CHUVA_H = 2;
/**
 * Decisão de projeto do app (não é regra do veredito): a partir de 40% de chance de chuva no
 * horizonte de 2 h, "Leve guarda-chuva" vira recomendação mesmo com chuva prevista fraca.
 */
export const PROBABILIDADE_GUARDA_CHUVA_PCT = 40;
