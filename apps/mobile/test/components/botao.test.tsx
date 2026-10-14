// Botao: toque, desabilitado bloqueia o toque, carregando expõe "busy" e mantém o rótulo;
// retorno ao pressionar (escala 0,97 + transição de 120 ms) e movimento reduzido (só o fundo).
// Anti-duplo-toque e háptica: test/components/use-toque-protegido.test.tsx.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Botao } from '@/components/botao';
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

function superficie() {
  return StyleSheet.flatten(screen.getByTestId('botao-superficie').props.style);
}

describe('Botao', () => {
  beforeEach(() => {
    mockReduzido = false;
  });

  it('chama onPress', async () => {
    const onPress = jest.fn();
    await render(<Botao titulo="Salvar" variante="primario" icone="mais" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('desabilitado não chama onPress', async () => {
    const onPress = jest.fn();
    await render(<Botao titulo="Salvar" desabilitado onPress={onPress} />);
    await fireEvent.press(screen.getByText('Salvar'));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('carregando: rótulo continua e o estado é busy', async () => {
    await render(<Botao titulo="Atualizando…" carregando onPress={jest.fn()} />);
    expect(screen.getByText('Atualizando…')).toBeTruthy();
    expect(screen.getByRole('button').props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    });
  });

  it('press-in: escala 0,97 com transição curta; solta e volta a 1', async () => {
    await render(<Botao titulo="Salvar" variante="primario" onPress={jest.fn()} />);
    expect(superficie().transform).toEqual([{ scale: 1 }]);
    expect(superficie().transitionDuration).toBe(motion.toque);
    expect(motion.toque).toBeLessThanOrEqual(150);
    await fireEvent(screen.getByRole('button'), 'pressIn');
    expect(superficie().transform).toEqual([{ scale: motion.escalaBotao }]);
    await fireEvent(screen.getByRole('button'), 'pressOut');
    expect(superficie().transform).toEqual([{ scale: 1 }]);
  });

  it('movimento reduzido: não escala, só o fundo muda', async () => {
    mockReduzido = true;
    await render(<Botao titulo="Salvar" variante="primario" onPress={jest.fn()} />);
    const antes = superficie().backgroundColor;
    await fireEvent(screen.getByRole('button'), 'pressIn');
    expect(superficie().transform).toEqual([{ scale: 1 }]);
    expect(superficie().transitionProperty).toEqual(['backgroundColor']);
    expect(superficie().backgroundColor).not.toBe(antes);
  });
});
