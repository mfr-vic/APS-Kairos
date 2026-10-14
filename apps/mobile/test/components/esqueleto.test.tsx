// Esqueleto: fora da leitura de tela (quem usa rotula o contêiner); brilho discreto em loop,
// desligado com movimento reduzido.
import { render, screen } from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';

import { BRILHO_ESQUELETO, Esqueleto } from '@/components/esqueleto';
import { motion } from '@/theme';

let mockReduzido = false;
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => mockReduzido,
}));

const estilo = () => StyleSheet.flatten(screen.getByTestId('esqueleto', { includeHiddenElements: true }).props.style);

beforeEach(() => {
  mockReduzido = false;
});

it('fica fora da leitura de tela', async () => {
  await render(
    <View testID="c">
      <Esqueleto largura={40} altura={12} />
    </View>
  );
  const bloco = screen.getByTestId('c').children[0] as unknown as { props: Record<string, unknown> };
  expect(bloco.props.accessibilityElementsHidden).toBe(true);
});

it('brilho: opacidade respira em loop, discreto (nunca some)', async () => {
  await render(<Esqueleto largura={40} altura={12} />);
  expect(estilo().animationName).toBe(BRILHO_ESQUELETO);
  expect(estilo().animationIterationCount).toBe('infinite');
  expect(estilo().animationDuration).toBe(motion.brilhoEsqueleto);
  expect(BRILHO_ESQUELETO['50%'].opacity).toBeGreaterThanOrEqual(0.5);
});

it('movimento reduzido: estático', async () => {
  mockReduzido = true;
  await render(<Esqueleto largura={40} altura={12} />);
  expect(estilo().animationName).toBeUndefined();
});
