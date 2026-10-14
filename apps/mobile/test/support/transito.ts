// Observação de trânsito (contrato 1.5.0, RF22) para os testes do briefing, mapa e alertas.
import type { Observation, TrafficValue } from '@kairos/contracts';

export const transito = (v: Partial<TrafficValue> = {}, extra: Partial<Observation> = {}): Observation =>
  ({
    dimension: 'traffic',
    source: 'tomtom',
    status: 'fresh',
    observedAt: '2026-10-10T08:07:00-03:00',
    fetchedAt: '2026-10-10T08:07:30-03:00',
    ttlSeconds: 120,
    value: {
      distanciaM: 8400,
      duracaoLivreS: 22 * 60,
      duracaoAtualS: 28 * 60,
      atrasoS: 6 * 60,
      nivel: 'MODERADO',
      trechosLentos: [{ atrasoS: 240, comprimentoM: 1200, magnitude: 2 }],
      ...v,
    },
    ...extra,
  }) as Observation;
