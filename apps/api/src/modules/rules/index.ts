// Módulo de regras (T24/T25): RN01–RN08, faixa do ar, confiança C1–C3 e janela meteorológica.
export * from './thresholds.js';
export { classificarFaixaAr } from './air-quality.js';
export { classificarNivelTransito } from './traffic.js';
export {
  agregarVeredito,
  calcularVeredito,
  dimensoesTransporteVinculadas,
  rn05Ativa,
  type ResultadoVeredito,
  type TrajetoVinculos,
} from './verdict.js';
export { calcularConfianca, dimensoesRelevantes } from './confidence.js';
export { calcularJanelaMeteorologica } from './weather-window.js';
