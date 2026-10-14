import { avisoDaLinha } from '@/features/itinerario/aviso-da-linha';

describe('avisoDaLinha', () => {
  it('L6 (em implantação) tem aviso; linhas em operação plena não', () => {
    expect(avisoDaLinha('L6')).toMatchObject({ titulo: 'Linha em implantação' });
    for (const l of ['L1', 'L2', 'L3', 'L4', 'L5', 'L7', 'L8', 'L9', 'L15'] as const) {
      expect(avisoDaLinha(l)).toBeNull();
    }
  });

  it('o texto não cita estações específicas (não confirmado em fonte oficial)', () => {
    expect(avisoDaLinha('L6')!.texto).not.toMatch(/Maristela|Perdizes|São Joaquim/);
  });
});
