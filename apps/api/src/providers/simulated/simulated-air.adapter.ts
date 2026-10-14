// Qualidade do ar simulada (T21, RF19): substitui o Open-Meteo Air Quality (RF07) no modo demonstração.
import type { AirValue } from '@kairos/contracts';
import { classificarFaixaAr } from '../../modules/rules/index.js';
import type { ParametrosAr } from './cenario-simulado.js';
import { PREFIXO_SIMULADO, SimulatedAdapter } from './simulated.adapter.js';

export class SimulatedAirAdapter extends SimulatedAdapter<'air'> {
  readonly dimension = 'air' as const;
  readonly source = `${PREFIXO_SIMULADO}open-meteo-air-quality`;
  readonly ttlSeconds = 60 * 60; // igual ao real (C.5)
  protected readonly padrao: ParametrosAr = { pm25Media24h: 12, pm25: 10, indice: 50 };
  protected readonly campoObrigatorio = 'pm25Media24h';

  // A faixa sai da média de 24 h pela mesma função das regras (B.8), como no adaptador real
  protected montarValor(params: ParametrosAr): AirValue {
    return {
      pm25: params.pm25,
      pm25Media24h: params.pm25Media24h,
      indice: params.indice,
      escalaIndice: 'US_AQI',
      faixa: classificarFaixaAr(params.pm25Media24h),
      estimativaDeModelo: true,
    };
  }
}
