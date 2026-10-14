// Provedores simulados (T21, RF19, RNF08): um por dimensão, mesma interface DimensionProvider dos reais.
import type { Clock } from '../../infrastructure/clock.js';
import type { FonteDeCenario } from './cenario-simulado.js';
import { SimulatedAirAdapter } from './simulated-air.adapter.js';
import { SimulatedBusAdapter } from './simulated-bus.adapter.js';
import { SimulatedFloodAdapter } from './simulated-flood.adapter.js';
import { SimulatedRailAdapter } from './simulated-rail.adapter.js';
import { SimulatedTrafficAdapter } from './simulated-traffic.adapter.js';
import { SimulatedWeatherAdapter } from './simulated-weather.adapter.js';

export * from './cenario-simulado.js';
export {
  CORPO_MALFORMADO,
  PREFIXO_SIMULADO,
  SimulatedAdapter,
  type SimulatedAdapterOptions,
} from './simulated.adapter.js';
export { SimulatedAirAdapter } from './simulated-air.adapter.js';
export { LINHA_ONIBUS_PADRAO, PARADA_PADRAO, SimulatedBusAdapter } from './simulated-bus.adapter.js';
export { SimulatedFloodAdapter } from './simulated-flood.adapter.js';
export { LINHAS_TRILHO_PADRAO, SimulatedRailAdapter } from './simulated-rail.adapter.js';
export { SimulatedTrafficAdapter } from './simulated-traffic.adapter.js';
export { SimulatedWeatherAdapter } from './simulated-weather.adapter.js';

export interface ProvedoresSimulados {
  weather: SimulatedWeatherAdapter;
  air: SimulatedAirAdapter;
  bus: SimulatedBusAdapter;
  rail: SimulatedRailAdapter;
  flood: SimulatedFloodAdapter;
  traffic: SimulatedTrafficAdapter;
}

/** Cria os 6 simulados ligados ao mesmo estado de cenário. Crie UMA vez por app, como o runner. */
export function criarProvedoresSimulados(fonte: FonteDeCenario, clock: Clock): ProvedoresSimulados {
  const options = { fonte, clock };
  return {
    weather: new SimulatedWeatherAdapter(options),
    air: new SimulatedAirAdapter(options),
    bus: new SimulatedBusAdapter(options),
    rail: new SimulatedRailAdapter(options),
    flood: new SimulatedFloodAdapter(options),
    traffic: new SimulatedTrafficAdapter(options),
  };
}
