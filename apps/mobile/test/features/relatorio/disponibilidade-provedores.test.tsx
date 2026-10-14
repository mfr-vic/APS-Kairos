// RF26: disponibilidade por fonte com número, barra e contagens.
import { render, screen } from '@testing-library/react-native';

import { DisponibilidadeProvedores } from '@/features/relatorio/disponibilidade-provedores';

import { RELATORIO_EXEMPLO } from '../../support/relatorio';

describe('DisponibilidadeProvedores', () => {
  it('número, barra na largura da porcentagem e "sem consultas"', async () => {
    await render(<DisponibilidadeProvedores provedores={RELATORIO_EXEMPLO.disponibilidadePorProvedor} />);
    expect(screen.getByText('75%')).toBeTruthy();
    expect(screen.getByTestId('disponibilidade-metro-sp')).toHaveStyle({ width: '75%' });
    expect(screen.getByText('3 atual · 0 em cache · 1 indisponível, de 4 consultas')).toBeTruthy();
    expect(screen.getByText('sem consultas')).toBeTruthy();
    expect(screen.getByTestId('disponibilidade-artesp')).toHaveStyle({ width: '0%' });
  });
});
