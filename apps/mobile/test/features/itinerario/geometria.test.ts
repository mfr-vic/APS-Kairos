import {
  distanciaM,
  normalizarNome,
  ordenarPelaPolilinha,
  posicaoNaPolilinha,
} from '@/features/itinerario/geometria';

describe('distanciaM (haversine)', () => {
  it('é zero no mesmo ponto e simétrica', () => {
    const a = { lat: -23.55, lon: -46.63 };
    const b = { lat: -23.56, lon: -46.64 };
    expect(distanciaM(a, a)).toBe(0);
    expect(distanciaM(a, b)).toBeCloseTo(distanciaM(b, a), 6);
  });

  it('1 milésimo de grau de latitude ≈ 111 m', () => {
    expect(distanciaM({ lat: -23.55, lon: -46.63 }, { lat: -23.551, lon: -46.63 })).toBeCloseTo(
      111.2,
      0
    );
  });
});

describe('normalizarNome', () => {
  it.each([
    ['PALMEIRAS - BARRA FUNDA', 'Palmeiras-Barra Funda'],
    ['SESC POMPEIA', 'SESC-Pompéia'],
    ['LAPA (LINHA 8)', 'Lapa'],
    ['SANTO AMARO (LINHA 9)', 'Santo Amaro'],
    ['AACD-SERVIDOR', 'AACD-Servidor'],
    ['S. N. Sra.', 's n sra'],
  ])('%s = %s', (a, b) => {
    expect(normalizarNome(a)).toBe(normalizarNome(b));
  });

  it('nomes diferentes continuam diferentes', () => {
    expect(normalizarNome('Domingos de Moraes')).not.toBe(normalizarNome('DOMINGOS DE MORAIS'));
  });
});

describe('posição e ordenação ao longo da polilinha', () => {
  // Linha em "L": para leste e depois para o sul.
  const polilinha = [
    { lat: -23.5, lon: -46.7 },
    { lat: -23.5, lon: -46.6 },
    { lat: -23.6, lon: -46.6 },
  ];

  it('mede a posição desde o 1º vértice, projetando no segmento mais próximo', () => {
    const inicio = posicaoNaPolilinha({ lat: -23.5, lon: -46.7 }, polilinha);
    const meioPrimeiro = posicaoNaPolilinha({ lat: -23.501, lon: -46.65 }, polilinha);
    const segundo = posicaoNaPolilinha({ lat: -23.55, lon: -46.599 }, polilinha);
    expect(inicio).toBe(0);
    expect(meioPrimeiro).toBeGreaterThan(4_000);
    expect(segundo).toBeGreaterThan(meioPrimeiro);
  });

  it('ordena estações embaralhadas na ordem do traçado (não alfabética)', () => {
    const est = [
      { nome: 'C', coordenada: { lat: -23.58, lon: -46.6 } },
      { nome: 'A', coordenada: { lat: -23.5, lon: -46.69 } },
      { nome: 'B', coordenada: { lat: -23.5, lon: -46.62 } },
    ];
    expect(ordenarPelaPolilinha(est, polilinha).map((e) => e.nome)).toEqual(['A', 'B', 'C']);
  });

  it('recusa polilinha com menos de 2 vértices', () => {
    expect(() => posicaoNaPolilinha({ lat: 0, lon: 0 }, [{ lat: 0, lon: 0 }])).toThrow();
  });
});
