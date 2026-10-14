import { CONTRACT_VERSION } from '@kairos/contracts';

import { CONCEITOS_SD } from '@/features/sobre/conceitos-sd';

describe('conceitos de Sistemas Distribuídos', () => {
  it('cada conceito tem exemplo e onde está no código; ids únicos', () => {
    expect(new Set(CONCEITOS_SD.map((c) => c.id)).size).toBe(CONCEITOS_SD.length);
    for (const c of CONCEITOS_SD) {
      expect(c.noKairos.length).toBeGreaterThan(20);
      expect(c.onde).toMatch(/apps\/|packages\//);
    }
  });

  it('cita os parâmetros do código (C.5) e a versão atual do contrato', () => {
    const texto = CONCEITOS_SD.map((c) => c.noKairos).join(' ');
    for (const parametro of ['4 s', '3 s', '3 falhas', '60 s', '80 %', '10 consultas por hora', '1 por segundo', '7 dias']) {
      expect(texto).toContain(parametro);
    }
    expect(texto).toContain(`contrato ${CONTRACT_VERSION}`);
  });
});
