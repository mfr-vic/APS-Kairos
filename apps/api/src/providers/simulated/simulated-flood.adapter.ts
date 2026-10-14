// Alagamentos simulados (T21, RF19): substituem a consulta ao PostGIS (RF10, GeoSampa) na demonstração.
import type { FloodValue } from '@kairos/contracts';
import type { ParametrosAlagamento } from './cenario-simulado.js';
import { PREFIXO_SIMULADO, SimulatedAdapter } from './simulated.adapter.js';

/** Raio da RN03/RN04 (B.8). */
const RAIO_M = 300;

export class SimulatedFloodAdapter extends SimulatedAdapter<'flood'> {
  readonly dimension = 'flood' as const;
  readonly source = `${PREFIXO_SIMULADO}geosampa`;
  readonly ttlSeconds = 24 * 60 * 60; // carga em lote: o dado muda pouco
  protected readonly padrao: ParametrosAlagamento = { distanciasM: [] };
  protected readonly campoObrigatorio = 'pontos';

  // sourceId e local deixam explícito que o ponto não é um registro real do GeoSampa
  protected montarValor(params: ParametrosAlagamento): FloodValue {
    return {
      raioM: RAIO_M,
      pontos: [...params.distanciasM]
        .sort((a, b) => a - b)
        .map((distanciaM, i) => ({
          sourceId: `simulado:alagamento:${i + 1}`,
          distanciaM,
          ocorridoEm: null,
          local: 'Ponto simulado (demonstração)',
        })),
    };
  }
}
