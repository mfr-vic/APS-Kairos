import { describe, expect, it } from 'vitest';
import { AirValueSchema } from '@kairos/contracts';
import { SimulatedAirAdapter } from '../../../src/providers/simulated/index.js';
import { FakeClock } from '../../infrastructure/helpers.js';
import { fonteControlada } from './helpers.js';

const signal = new AbortController().signal;

describe('SimulatedAirAdapter (T21)', () => {
  it('normal: faixa BOA calculada da média de 24 h; sempre estimativa de modelo', async () => {
    const air = new SimulatedAirAdapter({ fonte: fonteControlada(), clock: new FakeClock() });

    const valor = AirValueSchema.parse((await air.fetch({}, { signal })).value);

    expect(valor).toMatchObject({ pm25Media24h: 12, faixa: 'BOA', estimativaDeModelo: true, escalaIndice: 'US_AQI' });
  });

  it('média de 62 µg/m³ → faixa RUIM (B.8)', async () => {
    const air = new SimulatedAirAdapter({
      fonte: fonteControlada({ air: { tipo: 'valor', pm25Media24h: 62 } }),
      clock: new FakeClock(),
    });

    const valor = AirValueSchema.parse((await air.fetch({}, { signal })).value);

    expect(valor.faixa).toBe('RUIM');
  });
});
