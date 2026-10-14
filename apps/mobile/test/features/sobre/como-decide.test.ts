// "Como o Καιρός decide": mesmas regras e números da B.8 (limiares.ts), uma linha por regra.
import { COMO_DECIDE } from '@/features/sobre/como-decide';

describe('COMO_DECIDE', () => {
  it('cobre RN01–RN03 e RN05–RN09 com os limiares da B.8', () => {
    expect(COMO_DECIDE.map((r) => r.id)).toEqual(['RN01', 'RN02', 'RN03', 'RN05', 'RN06', 'RN07', 'RN09', 'RN08']);
    const texto = COMO_DECIDE.map((r) => `${r.titulo} ${r.texto}`).join(' ');
    for (const n of ['7,6 mm/h', '2,5', '300 m', '50 µg/m³', '20 min', '15 min']) expect(texto).toContain(n);
  });

  it('RN09 (14/10/2026): trânsito pesa só com ônibus vinculado; sem ônibus, só informa', () => {
    const rn09 = COMO_DECIDE.find((r) => r.id === 'RN09')!;
    expect(rn09.titulo).toContain('Atenção');
    expect(rn09.texto).toContain('TomTom');
    expect(rn09.texto).toContain('Sem ônibus vinculado, só informa');
  });

  it('RN06 diz de onde vem cada linha: ARTESP 4–9, Metrô 1/2/3/15 e o fallback de 4/5', () => {
    const rn06 = COMO_DECIDE.find((r) => r.id === 'RN06')!;
    expect(rn06.texto).toContain('4 a 9 pela API Trilhos da ARTESP');
    expect(rn06.texto).toContain('1, 2, 3 e 15 pela página Direto do Metrô');
    expect(rn06.texto).toContain('a 4 e a 5 se a ARTESP falhar');
  });
});
