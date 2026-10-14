// LinhaInformativa: lida como um item (título + texto); com onPress vira botão.
import { fireEvent, render, screen } from '@testing-library/react-native';

import { LinhaInformativa } from '@/components/linha-informativa';

it('um item só para o leitor de tela', async () => {
  await render(<LinhaInformativa icone="onibus" tom="ok" titulo="Pegue o 875A-10 das 08:16" texto="Chega em 6 min." />);
  expect(screen.getByLabelText('Pegue o 875A-10 das 08:16. Chega em 6 min.')).toBeTruthy();
});

it('com onPress: botão com o mesmo rótulo', async () => {
  const onPress = jest.fn();
  await render(<LinhaInformativa icone="editar" tom="neutro" titulo="Editar" onPress={onPress} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Editar' }));
  expect(onPress).toHaveBeenCalled();
});