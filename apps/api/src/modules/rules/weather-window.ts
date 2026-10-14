// Melhor janela meteorológica nas próximas 6 h (RF14, B.8). T25.
// Função pura: recebe `agora`; não lê relógio nem faz I/O.
import type { Observation, WeatherWindow } from '@kairos/contracts';
import { horasEmMs, horasNoHorizonte, isoSaoPaulo, observacaoDe, valorUtilizavel } from './helpers.js';
import { HORIZONTE_JANELA_H, JANELA_CHUVA_MAX_MM_H } from './thresholds.js';
import { rn05Ativa } from './verdict.js';

// Primeira hora cheia em (agora, agora + 6 h] com precipitação ≤ 2,5 mm/h.
// A precipitação do carimbo T é a soma de (T − 1 h, T] (convenção da B.8), então o carimbo T
// descreve a hora cheia [T − 1 h, T]. Só valem horas que começam em `agora` ou depois, para a
// janela inteira ficar no futuro: com agora = 08:08, a primeira candidata é 09:00–10:00
// (carimbo 10:00). Retorna null se a RN05 estiver ativa, sem clima utilizável ou sem hora válida.
export function calcularJanelaMeteorologica(observacoes: readonly Observation[], agora: Date): WeatherWindow {
  if (rn05Ativa(observacoes)) return null;
  const clima = valorUtilizavel(observacaoDe(observacoes, 'weather'));
  if (!clima) return null;

  const umaHora = horasEmMs(1);
  for (const h of horasNoHorizonte(clima, agora, HORIZONTE_JANELA_H)) {
    const inicioMs = h.horaMs - umaHora;
    if (inicioMs < agora.getTime()) continue;
    if (h.precipitacaoMm <= JANELA_CHUVA_MAX_MM_H) {
      return { inicio: isoSaoPaulo(inicioMs), fim: isoSaoPaulo(h.horaMs) };
    }
  }
  return null;
}
