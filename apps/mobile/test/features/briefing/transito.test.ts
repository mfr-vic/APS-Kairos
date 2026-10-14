// RF22: leituras do trânsito (TomTom) — duração, atraso, níveis e o critério da RN09.
import {
  atrasoMin,
  formatarDuracao,
  NIVEL_TRANSITO,
  temposDoTransito,
  textoAtraso,
  transitoPesado,
} from '@/features/briefing/transito';

describe('formatarDuracao', () => {
  it.each([
    [10, '1 min'],
    [6 * 60, '6 min'],
    [60 * 60, '1 h'],
    [65 * 60, '1 h 05 min'],
  ])('%d s → %s', (s, texto) => expect(formatarDuracao(s)).toBe(texto));
});

describe('atraso', () => {
  it('menos de 30 s = sem atraso; senão "+N min"', () => {
    expect(atrasoMin({ atrasoS: 20 })).toBe(0);
    expect(textoAtraso({ atrasoS: 20 })).toBe('sem atraso');
    expect(textoAtraso({ atrasoS: 6 * 60 })).toBe('+6 min');
  });

  it('tempos com e sem trânsito', () => {
    expect(temposDoTransito({ duracaoAtualS: 34 * 60, duracaoLivreS: 22 * 60 })).toBe('34 min agora · 22 min sem trânsito');
  });
});

describe('transitoPesado (mesmo critério da RN09 no servidor)', () => {
  it('atraso ≥ 15 min ou nível intenso/parado', () => {
    expect(transitoPesado({ atrasoS: 14 * 60, nivel: 'MODERADO' })).toBe(false);
    expect(transitoPesado({ atrasoS: 15 * 60, nivel: 'MODERADO' })).toBe(true);
    expect(transitoPesado({ atrasoS: 0, nivel: 'INTENSO' })).toBe(true);
    expect(transitoPesado({ atrasoS: 0, nivel: 'PARADO' })).toBe(true);
  });

  it('trânsito nunca usa a cor de Aguardar (RN09 vai no máximo a Atenção)', () => {
    expect(Object.values(NIVEL_TRANSITO).map((n) => n.tom)).not.toContain('erro');
  });
});
