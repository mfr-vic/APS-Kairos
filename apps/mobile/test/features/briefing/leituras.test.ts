// Leituras derivadas: chegadas relativas a "agora", pico de chuva no horizonte de 2 h, tom da chuva.
import type { BusValue, WeatherValue } from '@kairos/contracts';

import {
  alagamentoMaisProximo,
  chegadas,
  emMinutos,
  maiorChanceDeChuva,
  picoDeChuva,
  tomDaChuva,
} from '@/features/briefing/leituras';

import { AGORA, clima, onibus } from '../../support/briefing';

describe('emMinutos', () => {
  it.each([
    [0, 'agora'],
    [-3, 'agora'],
    [1, 'em 1 min'],
    [59, 'em 59 min'],
    [60, 'em 1 h'],
    [65, 'em 1 h 05 min'],
  ])('%i → %s', (n, s) => expect(emMinutos(n)).toBe(s));
});

describe('chegadas', () => {
  it('ordena pela chegada mais próxima, conta de AGORA e põe "sem previsão" por último', () => {
    const v = onibus([
      { letreiro: 'B', codigoLinha: 2, proximaChegada: null },
      { letreiro: 'A', codigoLinha: 1, proximaChegada: '2026-10-10T08:16:00-03:00' },
      { letreiro: 'C', codigoLinha: 3, proximaChegada: '2026-10-10T08:05:00-03:00' },
    ]).value as BusValue;
    const r = chegadas(v, AGORA);
    expect(r.map((c) => [c.letreiro, c.minutos])).toEqual([
      ['C', -5],
      ['A', 6],
      ['B', null],
    ]);
  });
});

describe('picoDeChuva / maiorChanceDeChuva', () => {
  const v = clima(
    [
      { h: '08', mm: 9, p: 90 }, // já passou (08:00 < 08:10): fora do horizonte
      { h: '09', mm: 3.1, p: 60 },
      { h: '10', mm: 1, p: 75 },
      { h: '11', mm: 20, p: 99 }, // 3ª hora futura: fora das 2 h
    ],
    0.2
  ).value as WeatherValue;

  it('considera agora + as 2 horas futuras seguintes', () => {
    expect(picoDeChuva(v, AGORA)).toEqual({ mm: 3.1, hora: '2026-10-10T09:00:00-03:00', probabilidade: 60 });
    expect(maiorChanceDeChuva(v, AGORA)).toEqual({ pct: 75, hora: '2026-10-10T10:00:00-03:00' });
  });

  it('chuva de agora vence quando é a maior (hora null)', () => {
    const forte = clima([{ h: '09', mm: 0, p: 0 }], 8).value as WeatherValue;
    expect(picoDeChuva(forte, AGORA)).toEqual({ mm: 8, hora: null, probabilidade: null });
  });
});

describe('tomDaChuva (limiares AMS da B.8)', () => {
  it.each([
    [0, 'ok'],
    [2.5, 'ok'],
    [2.6, 'atencao'],
    [7.6, 'atencao'],
    [7.7, 'erro'],
  ])('%f mm/h → %s', (mm, tom) => expect(tomDaChuva(mm)).toBe(tom));
});

describe('alagamentoMaisProximo', () => {
  it('arredonda a menor distância; sem pontos → null', () => {
    expect(alagamentoMaisProximo({ raioM: 300, pontos: [] })).toBeNull();
    expect(
      alagamentoMaisProximo({
        raioM: 300,
        pontos: [
          { sourceId: 'a', distanciaM: 210.4, ocorridoEm: null, local: null },
          { sourceId: 'b', distanciaM: 49.6, ocorridoEm: null, local: null },
        ],
      })
    ).toBe(50);
  });
});
