import { describe, expect, it } from 'vitest';
import { TrafficValueSchema } from '@kairos/contracts';
import { SimulatedTrafficAdapter } from '../../../src/providers/simulated/index.js';
import { FakeClock } from '../../infrastructure/helpers.js';
import { fonteControlada } from './helpers.js';

const signal = new AbortController().signal;

describe('SimulatedTrafficAdapter (RF19, RF22)', () => {
  it('normal: estável, 1 min de atraso sobre 14 min → LIVRE, sem trechos lentos; fonte simulado:tomtom', async () => {
    const t = new SimulatedTrafficAdapter({ fonte: fonteControlada(), clock: new FakeClock() });
    const valor = TrafficValueSchema.parse((await t.fetch({}, { signal })).value);
    expect(t.source).toBe('simulado:tomtom');
    expect(valor).toEqual({ distanciaM: 5200, duracaoLivreS: 840, duracaoAtualS: 900, atrasoS: 60, nivel: 'LIVRE', trechosLentos: [] });
  });

  it('atraso de 10 min → INTENSO com um trecho lento (cenário transito-intenso)', async () => {
    const t = new SimulatedTrafficAdapter({ fonte: fonteControlada({ traffic: { tipo: 'valor', atrasoS: 600 } }), clock: new FakeClock() });
    const valor = TrafficValueSchema.parse((await t.fetch({}, { signal })).value);
    expect(valor).toMatchObject({ duracaoAtualS: 1440, nivel: 'INTENSO', trechosLentos: [{ atrasoS: 600, magnitude: 3 }] });
  });
});
