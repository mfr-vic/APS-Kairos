// Clima simulado (T21, RF19): substitui o Open-Meteo Forecast (RF06) no modo demonstração.
import type { WeatherValue } from '@kairos/contracts';
import type { ParametrosClima } from './cenario-simulado.js';
import { HORA_MS, PREFIXO_SIMULADO, SimulatedAdapter, isoSaoPaulo, proximaHoraCheia } from './simulated.adapter.js';

/** Horas da previsão simulada (o contrato aceita até 7). */
const HORAS_PREVISAO = 6;

export class SimulatedWeatherAdapter extends SimulatedAdapter<'weather'> {
  readonly dimension = 'weather' as const;
  readonly source = `${PREFIXO_SIMULADO}open-meteo`;
  readonly ttlSeconds = 15 * 60; // igual ao real (C.5)
  protected readonly padrao: ParametrosClima = { chuvaMmH: [], temperaturaC: 24 };
  protected readonly campoObrigatorio = 'atual';

  // Carimbos nas próximas horas cheias depois do observedAt; hora sem valor em chuvaMmH = 0 mm/h
  protected montarValor(params: ParametrosClima, _input: unknown, observadoMs: number): WeatherValue {
    const primeira = proximaHoraCheia(observadoMs);
    const horas = Array.from({ length: HORAS_PREVISAO }, (_, i) => {
      const precipitacaoMm = params.chuvaMmH[i] ?? 0;
      return {
        hora: isoSaoPaulo(primeira + i * HORA_MS),
        precipitacaoMm,
        probabilidadePrecipitacao: precipitacaoMm > 0 ? 90 : 10,
        temperaturaC: params.temperaturaC,
      };
    });
    // Vento, sensação, umidade, UV, extremos e sol fixos e plausíveis (ilustrativos, como os demais valores simulados).
    // Código WMO pela chuva máxima do cenário e limiares AMS da B.8: 3 nublado, 61 fraca, 63 moderada, 65 forte.
    const chuvaMax = Math.max(0, ...params.chuvaMmH);
    const codigoTempo = chuvaMax > 7.6 ? 65 : chuvaMax > 2.5 ? 63 : chuvaMax > 0 ? 61 : 3;
    const dia = isoSaoPaulo(observadoMs).slice(0, 10);
    return {
      atual: {
        temperaturaC: params.temperaturaC,
        precipitacaoMm: 0,
        ventoKmH: 8,
        codigoTempo,
        sensacaoC: params.temperaturaC - 1,
        umidadePct: 70,
        uv: 5,
      },
      hoje: { temperaturaMaxC: params.temperaturaC + 4, temperaturaMinC: params.temperaturaC - 4 },
      sol: { nascer: `${dia}T06:00:00-03:00`, por: `${dia}T18:15:00-03:00` },
      horas,
    };
  }
}
