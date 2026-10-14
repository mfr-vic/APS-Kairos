// Secao: título como cabeçalho, ação à direita e rodapé.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Secao } from '@/components/secao';

it('título, ação e rodapé', async () => {
  const onPress = jest.fn();
  await render(
    <Secao titulo="O que fazer agora" acao={{ rotulo: 'Ver todas (5)', onPress }} rodape="Open-Meteo">
      <Text>conteúdo</Text>
    </Secao>
  );
  expect(screen.getByRole('header', { name: 'O que fazer agora' })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Ver todas (5)' }));
  expect(onPress).toHaveBeenCalled();
  expect(screen.getByText('Open-Meteo')).toBeTruthy();
});