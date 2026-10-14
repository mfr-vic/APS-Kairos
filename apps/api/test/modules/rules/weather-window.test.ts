// TC09: janela meteorológica com séries horárias sintéticas (RF14, T25)
import { describe, expect, it } from 'vitest';
import { WeatherWindowSchema, type Observation } from '@kairos/contracts';
import { calcularJanelaMeteorologica } from '../../../src/modules/rules/weather-window.js';
import { alagamento, ar, clima } from './fixtures.js';

// agora = 08:08; carimbos 08h…14h (como no exemplo do contrato). Carimbo T = chuva de (T − 1 h, T].
const AGORA = new Date('2026-10-10T08:08:00-03:00');
const DAS_8H = { primeiraHora: '2026-10-10T08:00:00-03:00' };

function janela(obs: Observation[], agora = AGORA) {
  const j = calcularJanelaMeteorologica(obs, agora);
  expect(WeatherWindowSchema.safeParse(j).success).toBe(true);
  return j;
}

const comClima = (precip: number[], opts = DAS_8H) => [clima(precip, opts), ar(10), alagamento([])];

describe('TC09 — janela meteorológica', () => {
  it('sem chuva → primeira hora cheia futura (09:00–10:00, carimbo 10h), com fuso -03:00', () => {
    expect(janela(comClima([0, 0, 0, 0, 0, 0, 0]))).toEqual({
      inicio: '2026-10-10T09:00:00-03:00',
      fim: '2026-10-10T10:00:00-03:00',
    });
  });

  it('chuva até 10h, 2,5 mm no carimbo 11h → janela 10:00–11:00', () => {
    // carimbos:          8h  9h   10h  11h  12h 13h 14h
    expect(janela(comClima([9, 9, 5.0, 2.5, 0, 0, 0]))).toEqual({
      inicio: '2026-10-10T10:00:00-03:00',
      fim: '2026-10-10T11:00:00-03:00',
    });
  });

  it('fronteira: 2,6 mm/h em todas as horas → null', () => {
    expect(janela(comClima([2.6, 2.6, 2.6, 2.6, 2.6, 2.6, 2.6]))).toBeNull();
  });

  it('chuva só no carimbo 9h (hora 08–09, que já começou) não impede a janela 09:00–10:00', () => {
    expect(janela(comClima([0, 12, 0, 0, 0, 0, 0]))).toEqual({
      inicio: '2026-10-10T09:00:00-03:00',
      fim: '2026-10-10T10:00:00-03:00',
    });
  });

  it('última hora possível no horizonte: só o carimbo 14h seco → 13:00–14:00', () => {
    expect(janela(comClima([9, 9, 9, 9, 9, 9, 0]))).toMatchObject({ inicio: '2026-10-10T13:00:00-03:00' });
  });

  it('hora seca além de agora + 6 h é ignorada → null', () => {
    // carimbos 9h…15h; 15h > 14:08
    const obs = comClima([9, 9, 9, 9, 9, 9, 0], { primeiraHora: '2026-10-10T09:00:00-03:00' });
    expect(janela(obs)).toBeNull();
  });

  it('agora em hora cheia (08:00): a hora 08:00–09:00 já vale', () => {
    expect(janela(comClima([0, 0, 0, 0, 0, 0, 0]), new Date('2026-10-10T08:00:00-03:00'))).toEqual({
      inicio: '2026-10-10T08:00:00-03:00',
      fim: '2026-10-10T09:00:00-03:00',
    });
  });

  it('RN05 ativa (MP2,5 24 h > 50) → null', () => {
    expect(janela([clima([0, 0, 0, 0, 0, 0, 0], DAS_8H), ar(50.1), alagamento([])])).toBeNull();
  });

  it('MP2,5 24 h = 50 (RN05 inativa) → há janela', () => {
    expect(janela([clima([0, 0, 0, 0, 0, 0, 0], DAS_8H), ar(50), alagamento([])])).not.toBeNull();
  });

  it('clima unavailable → null; clima stale continua valendo', () => {
    expect(janela([clima([], { status: 'unavailable' }), ar(10)])).toBeNull();
    expect(janela([clima([0, 0, 0, 0, 0, 0, 0], { ...DAS_8H, status: 'stale' }), ar(10)])).not.toBeNull();
  });
});
