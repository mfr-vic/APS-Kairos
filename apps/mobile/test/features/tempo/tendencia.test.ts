// Tendência de chuva de 3 h: horas[0] × horas[3], limiar 0,5 mm/h; série curta → null.
import { LIMIAR_TENDENCIA_MM, tendenciaChuva } from '@/features/tempo/tendencia';

const serie = (...mm: number[]) => mm.map((precipitacaoMm) => ({ precipitacaoMm }));

describe('tendenciaChuva', () => {
  it('menos de 4 horas na série → null', () => {
    expect(tendenciaChuva([])).toBeNull();
    expect(tendenciaChuva(serie(0, 1, 2))).toBeNull();
  });

  it('diferença ≥ 0,5 mm/h → aumentando; ≤ −0,5 → diminuindo', () => {
    expect(tendenciaChuva(serie(0, 0, 0, 0.5))).toBe('aumentando');
    expect(tendenciaChuva(serie(9.1, 4.2, 1.0, 0.3))).toBe('diminuindo');
  });

  it('abaixo do limiar (nos dois sentidos) → estável; horas além da 4ª são ignoradas', () => {
    expect(tendenciaChuva(serie(1, 5, 5, 1.4))).toBe('estavel');
    expect(tendenciaChuva(serie(1, 0, 0, 0.6))).toBe('estavel');
    expect(tendenciaChuva(serie(0, 0, 0, 0.2, 8))).toBe('estavel');
    expect(LIMIAR_TENDENCIA_MM).toBe(0.5);
  });
});
