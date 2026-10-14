// ListSection: título como cabeçalho, linhas (ignorando nulos) e rodapé; cada linha num
// ItemAnimado (saída + reflow), entrada só com `escalonar` ou para linhas que chegam depois.
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ListSection } from '@/components/list-section';

describe('ListSection', () => {
  it('mostra título, acessório, linhas e rodapé', async () => {
    await render(
      <ListSection titulo="Meus trajetos" rodape="Fonte: teste" acessorio={<Text>há 2 min</Text>}>
        <Text>Linha A</Text>
        {null}
        <Text>Linha B</Text>
      </ListSection>
    );
    expect(screen.getByRole('header', { name: 'Meus trajetos' })).toBeTruthy();
    expect(screen.getByText('Linha A')).toBeTruthy();
    expect(screen.getByText('Linha B')).toBeTruthy();
    expect(screen.getByText('Fonte: teste')).toBeTruthy();
    expect(screen.getByText('há 2 min')).toBeTruthy();
  });

  it('remover e acrescentar linhas: a lista acompanha (linha nova entra animada)', async () => {
    const { rerender } = await render(
      <ListSection>
        <Text key="a">Linha A</Text>
        <Text key="b">Linha B</Text>
      </ListSection>
    );
    const embrulho = (texto: string) =>
      screen.getByText(texto).parent as unknown as { props: Record<string, unknown> };
    // Na montagem, sem entrada (aparece junto com a seção), mas com saída e reflow.
    expect(embrulho('Linha A').props.entering).toBeUndefined();
    expect(embrulho('Linha A').props.exiting).toBeDefined();

    await rerender(
      <ListSection>
        <Text key="b">Linha B</Text>
        <Text key="c">Linha C</Text>
      </ListSection>
    );
    expect(screen.queryByText('Linha A')).toBeNull();
    expect(screen.getByText('Linha B')).toBeTruthy();
    expect(embrulho('Linha C').props.entering).toBeDefined();
  });
});
