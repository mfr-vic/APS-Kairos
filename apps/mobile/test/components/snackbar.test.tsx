// Snackbar: aparece com a mensagem, anuncia ao leitor de tela, some sozinho (3 s / 5 s com
// Desfazer), Desfazer chama a ação e fecha, o novo substitui o anterior.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Pressable, Text } from 'react-native';

import {
  DURACAO_COM_DESFAZER_MS,
  DURACAO_SNACKBAR_MS,
  SnackbarProvider,
  useSnackbar,
  type OpcoesSnackbar,
} from '@/components/snackbar';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

function Disparador({ opcoes, rotulo = 'disparar' }: { opcoes: OpcoesSnackbar; rotulo?: string }) {
  const { mostrar } = useSnackbar();
  return (
    <Pressable accessibilityRole="button" onPress={() => mostrar(opcoes)}>
      <Text>{rotulo}</Text>
    </Pressable>
  );
}

describe('Snackbar', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('mostra a mensagem, anuncia e some depois de 3 s', async () => {
    const anunciar = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await render(
      <SnackbarProvider>
        <Disparador opcoes={{ mensagem: '“Casa” salvo' }} />
      </SnackbarProvider>
    );
    await fireEvent.press(screen.getByText('disparar'));
    expect(screen.getByText('“Casa” salvo')).toBeTruthy();
    expect(screen.getByTestId('snackbar').props.accessibilityLiveRegion).toBe('polite');
    expect(anunciar).toHaveBeenCalledWith('“Casa” salvo');
    await act(async () => jest.advanceTimersByTime(DURACAO_SNACKBAR_MS + 10));
    expect(screen.queryByText('“Casa” salvo')).toBeNull();
  });

  it('com Desfazer: fica 5 s, anuncia a ação e o toque chama onPress e fecha', async () => {
    const desfazer = jest.fn();
    const anunciar = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await render(
      <SnackbarProvider>
        <Disparador opcoes={{ mensagem: '“Casa” excluído', acao: { rotulo: 'Desfazer', onPress: desfazer } }} />
      </SnackbarProvider>
    );
    await fireEvent.press(screen.getByText('disparar'));
    expect(anunciar).toHaveBeenLastCalledWith('“Casa” excluído. Ação disponível: Desfazer.');
    await act(async () => jest.advanceTimersByTime(DURACAO_SNACKBAR_MS + 10));
    expect(screen.getByText('“Casa” excluído')).toBeTruthy(); // ainda visível depois de 3 s
    const botao = screen.getByRole('button', { name: 'Desfazer' });
    expect(botao).toBeTruthy();
    await fireEvent.press(botao);
    expect(desfazer).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('“Casa” excluído')).toBeNull();
    expect(DURACAO_COM_DESFAZER_MS).toBe(5000);
  });

  it('um novo snackbar substitui o anterior (e o timer do anterior não apaga o novo)', async () => {
    await render(
      <SnackbarProvider>
        <Disparador opcoes={{ mensagem: 'primeiro' }} rotulo="a" />
        <Disparador opcoes={{ mensagem: 'segundo', acao: { rotulo: 'Desfazer', onPress: () => {} } }} rotulo="b" />
      </SnackbarProvider>
    );
    await fireEvent.press(screen.getByText('a'));
    await act(async () => jest.advanceTimersByTime(2000));
    await fireEvent.press(screen.getByText('b'));
    expect(screen.queryByText('primeiro')).toBeNull();
    await act(async () => jest.advanceTimersByTime(1500)); // 3,5 s desde o primeiro
    expect(screen.getByText('segundo')).toBeTruthy();
  });

  it('fora do provider, useSnackbar é no-op (não quebra componentes isolados)', async () => {
    await render(<Disparador opcoes={{ mensagem: 'x' }} />);
    await fireEvent.press(screen.getByText('disparar'));
    expect(screen.queryByText('x')).toBeNull();
  });
});
