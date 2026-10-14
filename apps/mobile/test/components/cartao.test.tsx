// Cartao: superfície; com onPress vira botão com rótulo, escala 0,98 no press-in (nada com
// movimento reduzido), háptica leve, anti-duplo-toque e spinner enquanto a ação roda.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { StyleSheet, Text } from 'react-native';

import { Cartao } from '@/components/cartao';
import { reiniciarFeedbackTatil } from '@/shared/feedback-tatil';
import { motion } from '@/theme';

let mockReduzido = false;
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => mockReduzido,
}));

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const escala = () =>
  StyleSheet.flatten(screen.getByTestId('cartao-superficie').props.style).transform;

beforeEach(() => {
  mockReduzido = false;
  jest.clearAllMocks();
  reiniciarFeedbackTatil();
});

it('com onPress vira botão com o rótulo', async () => {
  const onPress = jest.fn();
  await render(
    <Cartao onPress={onPress} accessibilityLabel="Abrir briefing">
      <Text>x</Text>
    </Cartao>
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Abrir briefing' }));
  expect(onPress).toHaveBeenCalled();
  expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
});

it('duplo toque dispara uma vez', async () => {
  const onPress = jest.fn();
  await render(
    <Cartao onPress={onPress} accessibilityLabel="Casa">
      <Text>x</Text>
    </Cartao>
  );
  const botao = screen.getByRole('button', { name: 'Casa' });
  await fireEvent.press(botao);
  await fireEvent.press(botao);
  expect(onPress).toHaveBeenCalledTimes(1);
});

it('press-in escala 0,98; com movimento reduzido não escala', async () => {
  await render(
    <Cartao onPress={() => {}} accessibilityLabel="Casa">
      <Text>x</Text>
    </Cartao>
  );
  await fireEvent(screen.getByRole('button'), 'pressIn');
  expect(escala()).toEqual([{ scale: motion.escalaCartao }]);

  mockReduzido = true;
  await render(
    <Cartao onPress={() => {}} accessibilityLabel="Casa">
      <Text>x</Text>
    </Cartao>
  );
  await fireEvent(screen.getByRole('button'), 'pressIn');
  expect(escala()).toEqual([{ scale: 1 }]);
});

it('ação assíncrona: spinner e busy até terminar', async () => {
  let resolver!: () => void;
  const promessa = new Promise<void>((r) => (resolver = r));
  await render(
    <Cartao onPress={() => promessa} accessibilityLabel="Casa">
      <Text>x</Text>
    </Cartao>
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Casa' }));
  expect(screen.getByTestId('cartao-processando')).toBeTruthy();
  expect(screen.getByRole('button').props.accessibilityState).toMatchObject({ busy: true });
  await act(async () => resolver());
  expect(screen.queryByTestId('cartao-processando')).toBeNull();
});

it('sem onPress: não é botão', async () => {
  await render(
    <Cartao>
      <Text>só conteúdo</Text>
    </Cartao>
  );
  expect(screen.queryByRole('button')).toBeNull();
});
