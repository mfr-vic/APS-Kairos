import { describe, expect, it } from 'vitest';
import { WeatherValueSchema } from '@kairos/contracts';
import { SimulatedWeatherAdapter } from '../../../src/providers/simulated/index.js';
import { FakeClock } from '../../infrastructure/helpers.js';
import { fonteControlada } from './helpers.js';

const signal = new AbortController().signal;

describe('SimulatedWeatherAdapter (T21)', () => {
  it('6 horas cheias depois do observedAt, em -03:00, com a chuva do cenário e 0 no resto', async () => {
    const clock = new FakeClock(Date.parse('2026-10-10T18:08:00-03:00'));
    const weather = new SimulatedWeatherAdapter({
      fonte: fonteControlada({ weather: { tipo: 'valor', chuvaMmH: [12, 9, 3] } }),
      clock,
    });

    const { value } = await weather.fetch({}, { signal });

    const valor = WeatherValueSchema.parse(value);
    expect(valor.horas.map((h) => h.hora)).toEqual([
      '2026-10-10T19:00:00-03:00',
      '2026-10-10T20:00:00-03:00',
      '2026-10-10T21:00:00-03:00',
      '2026-10-10T22:00:00-03:00',
      '2026-10-10T23:00:00-03:00',
      '2026-10-11T00:00:00-03:00',
    ]);
    expect(valor.horas.map((h) => h.precipitacaoMm)).toEqual([12, 9, 3, 0, 0, 0]);
    // Vento, sensação, umidade, UV, extremos e sol fixos e estáveis, no dia do observedAt (-03:00)
    expect(valor.atual).toEqual({
      temperaturaC: 24,
      precipitacaoMm: 0,
      ventoKmH: 8,
      codigoTempo: 65, // 12 mm/h > 7,6: chuva forte
      sensacaoC: 23,
      umidadePct: 70,
      uv: 5,
    });
    expect(valor.hoje).toEqual({ temperaturaMaxC: 28, temperaturaMinC: 20 });
    expect(valor.sol).toEqual({ nascer: '2026-10-10T06:00:00-03:00', por: '2026-10-10T18:15:00-03:00' });
  });

  it.each([
    [[], 3],
    [[1], 61],
    [[5, 3, 1], 63],
    [[12, 9, 3], 65],
  ])('codigoTempo WMO pela chuva máxima do cenário: %j → %i', async (chuvaMmH, esperado) => {
    const clock = new FakeClock(Date.parse('2026-10-10T18:08:00-03:00'));
    const weather = new SimulatedWeatherAdapter({ fonte: fonteControlada({ weather: { tipo: 'valor', chuvaMmH } }), clock });
    const { value } = await weather.fetch({}, { signal });
    expect(value.atual.codigoTempo).toBe(esperado);
  });

  it('em hora cheia exata, a primeira previsão é a próxima hora (carimbo > agora, B.8)', async () => {
    const clock = new FakeClock(Date.parse('2026-10-10T18:00:00-03:00'));
    const weather = new SimulatedWeatherAdapter({ fonte: fonteControlada(), clock });

    const { value } = await weather.fetch({}, { signal });

    expect(value.horas[0]?.hora).toBe('2026-10-10T19:00:00-03:00');
  });
});
