// "Atrasos e obstáculos": itens com causa humana; vazia diz o que foi verificado.
import { render, screen } from '@testing-library/react-native';

import { ListaObstaculos } from '@/features/briefing/lista-obstaculos';

import { AGORA, fixture } from '../../support/briefing';

describe('ListaObstaculos', () => {
  it('AGUARDAR: alagamento e Metrô sem dados', async () => {
    await render(<ListaObstaculos briefing={fixture('AGUARDAR')} agora={AGORA} />);
    expect(screen.getByTestId('obstaculo-alagamento')).toBeTruthy();
    expect(screen.getByText('Metrô e trem: sem dados agora')).toBeTruthy();
  });

  it('FAVORÁVEL: "Nenhum atraso ou obstáculo" com o que foi verificado', async () => {
    await render(<ListaObstaculos briefing={fixture('FAVORAVEL')} agora={AGORA} />);
    expect(screen.getByText('Nenhum atraso ou obstáculo')).toBeTruthy();
    expect(screen.getByText(/^Ônibus chegando em até 20 min/)).toBeTruthy();
  });
});
