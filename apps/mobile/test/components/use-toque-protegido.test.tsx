// Toque protegido (item 8): duplo toque não repete a ação; ação assíncrona deixa o controle
// "processando" e bloqueia novos toques até terminar; demora > 400 ms ou insistência mostram UM
// snackbar "Processando…"; a háptica sai uma vez por ação (e não duplica a do handler).
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

import { Botao } from '@/components/botao';
import { SnackbarProvider } from '@/components/snackbar';
import {
  AVISO_PROCESSANDO,
  AVISO_PROCESSANDO_MS,
  JANELA_TOQUE_MS,
} from '@/components/use-toque-protegido';
import { feedbackTatil, reiniciarFeedbackTatil } from '@/shared/feedback-tatil';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

function pendente() {
  let resolver!: () => void;
  const promessa = new Promise<void>((r) => (resolver = r));
  return { promessa, resolver };
}

beforeEach(() => {
  jest.clearAllMocks();
  reiniciarFeedbackTatil();
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

describe('useToqueProtegido (via Botao)', () => {
  it('duplo toque dispara a ação uma vez; depois da janela, aceita de novo', async () => {
    const onPress = jest.fn();
    await render(<Botao titulo="Abrir" onPress={onPress} />);
    const botao = screen.getByRole('button', { name: 'Abrir' });
    await fireEvent.press(botao);
    await fireEvent.press(botao);
    await fireEvent.press(botao);
    expect(onPress).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTime(JANELA_TOQUE_MS + 1));
    await fireEvent.press(botao);
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it('ação assíncrona: busy + spinner, toques ignorados até terminar', async () => {
    const { promessa, resolver } = pendente();
    const onPress = jest.fn(() => promessa);
    await render(<Botao titulo="Salvar" variante="primario" onPress={onPress} />);
    const botao = screen.getByRole('button', { name: 'Salvar' });
    await fireEvent.press(botao);
    expect(screen.getByRole('button').props.accessibilityState).toMatchObject({ busy: true });
    expect(screen.getByTestId('botao-processando')).toBeTruthy();
    // Mesmo depois da janela, enquanto a promessa não termina, não repete.
    await act(async () => jest.advanceTimersByTime(JANELA_TOQUE_MS + 1));
    await fireEvent.press(botao);
    expect(onPress).toHaveBeenCalledTimes(1);
    await act(async () => resolver());
    expect(screen.getByRole('button').props.accessibilityState?.busy).toBe(false);
    expect(screen.queryByTestId('botao-processando')).toBeNull();
  });

  it('demora > 400 ms: um snackbar "Processando…" anunciado', async () => {
    const { promessa, resolver } = pendente();
    await render(
      <SnackbarProvider>
        <Botao titulo="Abrir briefing" onPress={() => promessa} />
      </SnackbarProvider>
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Abrir briefing' }));
    expect(screen.queryByText(AVISO_PROCESSANDO)).toBeNull();
    await act(async () => jest.advanceTimersByTime(AVISO_PROCESSANDO_MS + 1));
    expect(screen.getByText(AVISO_PROCESSANDO)).toBeTruthy();
    await act(async () => resolver());
  });

  it('ação rápida não mostra o aviso', async () => {
    await render(
      <SnackbarProvider>
        <Botao titulo="Abrir" onPress={() => Promise.resolve()} />
      </SnackbarProvider>
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Abrir' }));
    await act(async () => jest.advanceTimersByTime(AVISO_PROCESSANDO_MS + 50));
    expect(screen.queryByText(AVISO_PROCESSANDO)).toBeNull();
  });

  it('insistir durante a ação: aviso imediato, uma vez, com háptica de aviso', async () => {
    const { promessa, resolver } = pendente();
    await render(
      <SnackbarProvider>
        <Botao titulo="Abrir" onPress={() => promessa} avisoProcessando="Abrindo…" />
      </SnackbarProvider>
    );
    const botao = screen.getByRole('button', { name: 'Abrir' });
    await fireEvent.press(botao);
    await fireEvent.press(botao);
    await fireEvent.press(botao);
    expect(screen.getByText('Abrindo…')).toBeTruthy();
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('warning');
    await act(async () => resolver());
  });

  it('háptica: leve no botão de ação, seleção no de texto, nenhuma com tatil={false}', async () => {
    await render(<Botao titulo="A" variante="primario" onPress={() => {}} />);
    await fireEvent.press(screen.getByRole('button', { name: 'A' }));
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light');

    await render(<Botao titulo="B" variante="texto" onPress={() => {}} />);
    await fireEvent.press(screen.getByRole('button', { name: 'B' }));
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();
    await render(<Botao titulo="C" tatil={false} onPress={() => {}} />);
    await fireEvent.press(screen.getByRole('button', { name: 'C' }));
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });

  it('se o handler já vibrou (ex.: sucesso), o botão não vibra de novo', async () => {
    await render(<Botao titulo="Salvar" onPress={() => feedbackTatil.sucesso()} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });
});
