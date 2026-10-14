// Distâncias da aba Mapa (14/10/2026): só rota calculada pela API; formatação pt-BR, texto do cartão
// e atribuição. Nenhum texto de "linha reta".
import type { RotaResponse } from '@kairos/contracts';

import { atribuicaoDaRota, formatarDistancia, textoDaRota } from '@/features/map/distancias';

const rota = (r: Partial<RotaResponse>): RotaResponse => ({
  modo: 'carro',
  fonte: 'tomtom',
  distanciaM: 8400,
  duracaoS: 22 * 60,
  atrasoTransitoS: 6 * 60,
  coordenadas: [
    [-46.6333, -23.5505],
    [-46.6559, -23.5614],
  ],
  observedAt: '2026-10-14T08:00:00-03:00',
  ...r,
});

describe('formatarDistancia', () => {
  it.each([
    [0, '10 m'],
    [854, '850 m'],
    [1000, '1,0 km'],
    [1234, '1,2 km'],
    [12_400, '12 km'],
  ])('%d m → %s', (m, texto) => {
    expect(formatarDistancia(m)).toBe(texto);
  });
});

describe('textoDaRota', () => {
  it('a pé: distância e minutos a pé', () => {
    expect(textoDaRota(rota({ modo: 'a-pe', distanciaM: 1200, duracaoS: 15 * 60, atrasoTransitoS: null }))).toEqual({
      valor: '1,2 km',
      detalhe: '15 min a pé',
    });
  });

  it('de carro com trânsito (TomTom): tempo de agora + atraso', () => {
    expect(textoDaRota(rota({}))).toEqual({ valor: '8,4 km', detalhe: '22 min de carro agora, +6 min de trânsito' });
  });

  it('atraso abaixo de 1 min não é citado; OSRM (sem trânsito) não diz "agora"', () => {
    expect(textoDaRota(rota({ atrasoTransitoS: 20 })).detalhe).toBe('22 min de carro agora');
    expect(textoDaRota(rota({ fonte: 'osrm', atrasoTransitoS: null })).detalhe).toBe('22 min de carro');
  });

  it('nunca fala em linha reta', () => {
    for (const r of [rota({}), rota({ modo: 'a-pe', atrasoTransitoS: null })]) {
      expect(JSON.stringify(textoDaRota(r))).not.toMatch(/linha reta/i);
    }
  });
});

describe('atribuicaoDaRota', () => {
  it('TomTom exige "© TomTom"; OSRM cita o OpenStreetMap', () => {
    expect(atribuicaoDaRota({ fonte: 'tomtom' })).toBe('© TomTom');
    expect(atribuicaoDaRota({ fonte: 'osrm' })).toContain('OpenStreetMap');
  });
});
