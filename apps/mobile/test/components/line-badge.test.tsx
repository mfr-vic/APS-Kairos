// LineBadge: bolinha do trilho com o número e chip do ônibus com o letreiro.
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { LineBadge } from '@/components/line-badge';

describe('LineBadge', () => {
  it('trilho: mostra o número e usa o nome da linha como rótulo', async () => {
    await render(<LineBadge tipo="trilho" linha="L15" rotulo="Linha 15-Prata" />);
    expect(screen.getByText('15')).toBeTruthy();
    expect(screen.getByLabelText('Linha 15-Prata')).toBeTruthy();
  });

  it('trilho sem rótulo é decorativo', async () => {
    await render(<LineBadge tipo="trilho" linha="L4" />);
    // Fora da árvore de acessibilidade: só aparece incluindo os elementos ocultos.
    expect(screen.queryByText('4')).toBeNull();
    expect(screen.getByText('4', { includeHiddenElements: true })).toBeTruthy();
  });

  it.each([
    ['L6', '#F68D1E'],
    ['L7', '#9E1766'],
    ['L8', '#9EA09D'],
    ['L9', '#00A99D'],
  ] as const)('linhas da ARTESP: %s usa a própria cor, não o cinza de fallback', async (linha, cor) => {
    await render(<LineBadge tipo="trilho" linha={linha} rotulo={linha} />);
    expect(StyleSheet.flatten(screen.getByLabelText(linha).props.style).backgroundColor).toBe(cor);
  });

  it('linha sem cor conhecida (L10) também renderiza', async () => {
    await render(<LineBadge tipo="trilho" linha="L10" rotulo="Linha 10" />);
    expect(screen.getByText('10')).toBeTruthy();
  });

  it('ônibus: chip com o letreiro', async () => {
    await render(<LineBadge tipo="onibus" letreiro="875A-10" tamanho="sm" />);
    expect(screen.getByText('875A-10')).toBeTruthy();
    expect(screen.getByLabelText('Ônibus 875A-10')).toBeTruthy();
  });
});
