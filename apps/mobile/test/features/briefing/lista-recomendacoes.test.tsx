// "O que fazer agora": limite na tela inicial e a linha "Siga normalmente" quando vazia.
import { render, screen } from '@testing-library/react-native';

import { ListaRecomendacoes } from '@/features/briefing/lista-recomendacoes';
import { recomendacoes } from '@/features/briefing/recomendacoes';

import { AGORA, fixture } from '../../support/briefing';

describe('ListaRecomendacoes', () => {
  it('com limite: só as mais urgentes', async () => {
    const itens = recomendacoes(fixture('AGUARDAR'), AGORA);
    expect(itens.length).toBeGreaterThan(1);
    await render(<ListaRecomendacoes itens={itens} limite={1} />);
    expect(screen.getByText(itens[0].titulo)).toBeTruthy();
    expect(screen.queryByText(itens[1].titulo)).toBeNull();
  });

  it('vazia: "Siga normalmente"', async () => {
    await render(<ListaRecomendacoes itens={[]} />);
    expect(screen.getByText('Siga normalmente')).toBeTruthy();
  });
});
