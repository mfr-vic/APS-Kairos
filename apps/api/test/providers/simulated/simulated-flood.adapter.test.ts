import { describe, expect, it } from 'vitest';
import { FloodValueSchema } from '@kairos/contracts';
import { SimulatedFloodAdapter } from '../../../src/providers/simulated/index.js';
import { FakeClock } from '../../infrastructure/helpers.js';
import { fonteControlada } from './helpers.js';

const signal = new AbortController().signal;

describe('SimulatedFloodAdapter (T21)', () => {
  it('normal: nenhum ponto no raio de 300 m', async () => {
    const flood = new SimulatedFloodAdapter({ fonte: fonteControlada(), clock: new FakeClock() });

    expect(FloodValueSchema.parse((await flood.fetch({}, { signal })).value)).toEqual({ raioM: 300, pontos: [] });
  });

  it('pontos ordenados por distância e marcados como simulados (não são registros do GeoSampa)', async () => {
    const flood = new SimulatedFloodAdapter({
      fonte: fonteControlada({ flood: { tipo: 'valor', distanciasM: [260, 120] } }),
      clock: new FakeClock(),
    });

    const valor = FloodValueSchema.parse((await flood.fetch({}, { signal })).value);

    expect(valor.pontos.map((p) => p.distanciaM)).toEqual([120, 260]);
    expect(valor.pontos.every((p) => p.sourceId.startsWith('simulado:') && p.ocorridoEm === null)).toBe(true);
  });
});
