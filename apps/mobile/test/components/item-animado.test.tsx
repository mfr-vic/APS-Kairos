// ItemAnimado: saída e reflow sempre animados; entrada só com `escalonar`; nada com movimento
// reduzido.
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ItemAnimado } from '@/components/item-animado';

let mockReduzido = false;
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => mockReduzido,
}));

const props = () => screen.getByTestId('item').props;

beforeEach(() => {
  mockReduzido = false;
});

it('padrão: sem entrada, com saída e transição de layout', async () => {
  await render(
    <ItemAnimado testID="item">
      <Text>Casa</Text>
    </ItemAnimado>
  );
  expect(screen.getByText('Casa')).toBeTruthy();
  expect(props().entering).toBeUndefined();
  expect(props().exiting).toBeDefined();
  expect(props().layout).toBeDefined();
});

it('escalonar: ganha entrada', async () => {
  await render(
    <ItemAnimado testID="item" indice={2} escalonar>
      <Text>Casa</Text>
    </ItemAnimado>
  );
  expect(props().entering).toBeDefined();
});

it('movimento reduzido: nenhuma animação', async () => {
  mockReduzido = true;
  await render(
    <ItemAnimado testID="item" indice={2} escalonar>
      <Text>Casa</Text>
    </ItemAnimado>
  );
  expect(props().entering).toBeUndefined();
  expect(props().exiting).toBeUndefined();
  expect(props().layout).toBeUndefined();
});
