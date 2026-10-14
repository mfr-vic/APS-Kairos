import {
  estacaoMaisProxima,
  montarItinerario,
  noTrecho,
  papelDaEstacao,
  rotuloEstacao,
  type Estacao,
} from '@/features/itinerario/montar-itinerario';

// Linha reta de oeste para leste, estações a ~1 km (0,01° de longitude).
const est = (nome: string, lon: number): Estacao => ({ nome, coordenada: { lat: -23.55, lon } });
const LINHA: Estacao[] = [
  est('A', -46.7),
  est('B', -46.69),
  est('C', -46.68),
  est('D', -46.67),
  est('E', -46.66),
];
const perto = (lon: number) => ({ lat: -23.551, lon });
const longe = { lat: -23.7, lon: -46.68 }; // ~16 km ao sul

describe('estacaoMaisProxima', () => {
  it('acha a estação mais perto e a distância', () => {
    const p = estacaoMaisProxima(LINHA, perto(-46.671))!;
    expect(p.indice).toBe(3);
    expect(p.distanciaM).toBeLessThan(200);
  });

  it('ignora estações sem coordenada; sem nenhuma, devolve null', () => {
    const sem = LINHA.map((e) => ({ ...e, coordenada: null }));
    expect(estacaoMaisProxima(sem, perto(-46.67))).toBeNull();
    const mista = [{ ...LINHA[0], coordenada: null }, ...LINHA.slice(1)];
    expect(estacaoMaisProxima(mista, perto(-46.7))!.indice).toBe(1);
  });
});

describe('montarItinerario', () => {
  it('sentido da ordem da fonte quando o destino está adiante (A→E)', () => {
    const itin = montarItinerario(LINHA, perto(-46.69), perto(-46.67), false);
    expect(itin.terminal).toBe('E');
    expect(itin.estacoes.map((e) => e.nome)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(itin.embarque).toBe(1);
    expect(itin.desembarque).toBe(3);
    expect(itin.paradas).toBe(2);
  });

  it('sentido inverso quando o destino está "atrás" na ordem da fonte', () => {
    const itin = montarItinerario(LINHA, perto(-46.67), perto(-46.7), false);
    expect(itin.terminal).toBe('A');
    expect(itin.estacoes[0].nome).toBe('E');
    expect(itin.estacoes[itin.embarque!].nome).toBe('D');
    expect(itin.estacoes[itin.desembarque!].nome).toBe('A');
    expect(itin.paradas).toBe(3);
  });

  it('"Trocar sentido" inverte o inferido e mantém embarque/desembarque nas mesmas estações', () => {
    const itin = montarItinerario(LINHA, perto(-46.69), perto(-46.67), true);
    expect(itin.terminal).toBe('A');
    expect(itin.estacoes[itin.embarque!].nome).toBe('B');
    expect(itin.estacoes[itin.desembarque!].nome).toBe('D');
    expect(itin.paradas).toBe(2);
  });

  it('destino a mais de 2 km da linha: não força desembarque, guarda a distância real', () => {
    const itin = montarItinerario(LINHA, perto(-46.69), longe, false);
    expect(itin.embarque).toBe(1);
    expect(itin.desembarque).toBeNull();
    expect(itin.destinoAteLinhaM).toBeGreaterThan(2_000);
    expect(itin.paradas).toBeNull();
    expect(itin.terminal).toBe('E'); // sem trecho, fica a ordem da fonte
  });

  it('origem e destino na mesma estação: sem trecho', () => {
    const itin = montarItinerario(LINHA, perto(-46.68), perto(-46.6805), false);
    expect(itin.embarque).toBe(2);
    expect(itin.desembarque).toBe(2);
    expect(itin.paradas).toBeNull();
    expect(noTrecho(itin, 2)).toBe(false);
  });

  it('linha sem coordenadas: semCoordenadas e nada marcado', () => {
    const itin = montarItinerario(
      LINHA.map((e) => ({ ...e, coordenada: null })),
      perto(-46.69),
      perto(-46.67),
      false
    );
    expect(itin.semCoordenadas).toBe(true);
    expect(itin.embarque).toBeNull();
    expect(itin.desembarque).toBeNull();
  });
});

describe('recorte do trecho e rótulos', () => {
  const itin = montarItinerario(LINHA, perto(-46.69), perto(-46.67), false);

  it('papéis: embarque, trecho, desembarque e fora', () => {
    expect([0, 1, 2, 3, 4].map((i) => papelDaEstacao(itin, i))).toEqual([
      'fora',
      'embarque',
      'trecho',
      'desembarque',
      'fora',
    ]);
  });

  it('rótulo completo para leitor de tela', () => {
    expect(rotuloEstacao(itin, 2)).toBe('C, 3ª estação, entre o embarque e o desembarque');
    expect(rotuloEstacao(itin, 1)).toBe('B, 2ª estação, embarque, estação mais próxima da origem');
    expect(rotuloEstacao(itin, 4)).toBe('E, 5ª estação, terminal');
  });
});
