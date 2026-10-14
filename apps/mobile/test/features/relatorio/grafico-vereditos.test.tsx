// RF26: barras empilhadas proporcionais ao dia de maior total, legenda e tabela textual acessível.
import { render, screen } from '@testing-library/react-native';

import { GraficoVereditos } from '@/features/relatorio/grafico-vereditos';

import { RELATORIO_EXEMPLO } from '../../support/relatorio';

// O desenho é oculto do leitor de tela (a tabela é a versão acessível).
const OCULTO = { includeHiddenElements: true };

describe('GraficoVereditos', () => {
  it('altura proporcional e tabela só com os dias que tiveram briefing', async () => {
    await render(<GraficoVereditos dias={RELATORIO_EXEMPLO.vereditosPorDia} />);
    expect(screen.getByTestId('barra-2026-10-14', OCULTO)).toHaveStyle({ height: 120 });
    expect(screen.getByTestId('barra-2026-10-12', OCULTO)).toHaveStyle({ height: 96 });
    expect(screen.getByTestId('barra-2026-10-13', OCULTO)).toHaveStyle({ height: 0 });
    expect(screen.getByLabelText('12/10: 3 Favorável, 1 Atenção')).toBeTruthy();
    expect(screen.getByLabelText('14/10: 2 Favorável, 2 Aguardar, 1 Indeterminado')).toBeTruthy();
    expect(screen.queryByLabelText(/^13\/10/)).toBeNull();
  });
});
