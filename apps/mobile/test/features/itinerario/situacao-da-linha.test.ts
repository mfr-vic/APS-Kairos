import { situacaoDaLinha } from '@/features/itinerario/situacao-da-linha';

import { comObservacao, fixture, trilhos } from '../../support/briefing';

describe('situacaoDaLinha', () => {
  const b = comObservacao(
    fixture('FAVORAVEL'),
    trilhos([
      { linha: 'L2', situacao: 'NORMAL', statusTexto: 'Operação Normal' },
      {
        linha: 'L8',
        situacao: 'ALTERADA',
        statusTexto: 'Maiores Intervalos',
        detalhe: 'Trens com maiores intervalos entre Barueri e Itapevi.',
      },
    ])
  );

  it('devolve a linha do último briefing com a hora da leitura', () => {
    const s = situacaoDaLinha(b, 'L8')!;
    expect(s.statusTexto).toBe('Maiores Intervalos');
    expect(s.fonte).toBe('artesp');
    expect(s.observadoEm).toBe('2026-10-10T08:06:00-03:00');
  });

  it('null sem briefing ou com a linha fora do briefing', () => {
    expect(situacaoDaLinha(undefined, 'L2')).toBeNull();
    expect(situacaoDaLinha(b, 'L4')).toBeNull();
  });
});
