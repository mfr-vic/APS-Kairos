// Trânsito simulado (RF19, RF22): substitui a TomTom no modo demonstração. Valor estável (5,2 km, 14 min
// sem trânsito, 1 min de atraso → LIVRE) salvo quando o cenário define outro atraso.
import type { TrafficValue } from '@kairos/contracts';
import { classificarNivelTransito } from '../../modules/rules/index.js';
import type { ParametrosTransito } from './cenario-simulado.js';
import { PREFIXO_SIMULADO, SimulatedAdapter } from './simulated.adapter.js';

export class SimulatedTrafficAdapter extends SimulatedAdapter<'traffic'> {
  readonly dimension = 'traffic' as const;
  readonly source = `${PREFIXO_SIMULADO}tomtom`;
  readonly ttlSeconds = 5 * 60; // igual ao real (C.5)
  protected readonly padrao: ParametrosTransito = { duracaoLivreS: 14 * 60, atrasoS: 60 };
  protected readonly campoObrigatorio = 'nivel';

  // Mesma classificação do caminho real (rules/traffic.ts); um trecho lento só quando há atraso relevante
  protected montarValor(params: ParametrosTransito): TrafficValue {
    const duracaoAtualS = params.duracaoLivreS + params.atrasoS;
    return {
      distanciaM: 5_200,
      duracaoLivreS: params.duracaoLivreS,
      duracaoAtualS,
      atrasoS: params.atrasoS,
      nivel: classificarNivelTransito(duracaoAtualS, params.duracaoLivreS),
      trechosLentos: params.atrasoS >= 5 * 60 ? [{ atrasoS: params.atrasoS, comprimentoM: 1_800, magnitude: 3 }] : [],
    };
  }
}
