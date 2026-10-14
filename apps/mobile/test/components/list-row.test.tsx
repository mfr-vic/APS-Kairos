// ListRow: com onPress vira botão com rótulo; sem onPress é só conteúdo. Fundo acende no
// press-in (sem escala), háptica de seleção, anti-duplo-toque e spinner no lugar do chevron.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { Text } from 'react-native';

import { ListRow } from '@/components/list-row';
import { reiniciarFeedbackTatil } from '@/shared/feedback-tatil';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

beforeEach(() => {
  jest.clearAllMocks();
  reiniciarFeedbackTatil();
});

describe('ListRow', () => {
  it('tocável: botão com rótulo e háptica de seleção', async () => {
    const onPress = jest.fn();
    await render(
      <ListRow onPress={onPress} accessibilityLabel="Ver briefing de Casa" chevron>
        <Text>Casa</Text>
      </ListRow>
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Ver briefing de Casa' }));
    expect(onPress).toHaveBeenCalled();
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('duplo toque abre uma vez só', async () => {
    const onPress = jest.fn();
    await render(
      <ListRow onPress={onPress} accessibilityLabel="Casa" chevron>
        <Text>Casa</Text>
      </ListRow>
    );
    const linha = screen.getByRole('button', { name: 'Casa' });
    await fireEvent.press(linha);
    await fireEvent.press(linha);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('ação assíncrona: spinner no lugar do chevron e busy', async () => {
    let resolver!: () => void;
    const promessa = new Promise<void>((r) => (resolver = r));
    await render(
      <ListRow onPress={() => promessa} accessibilityLabel="Casa" chevron>
        <Text>Casa</Text>
      </ListRow>
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Casa' }));
    expect(screen.getByTestId('linha-processando')).toBeTruthy();
    expect(screen.getByRole('button').props.accessibilityState).toMatchObject({ busy: true });
    await act(async () => resolver());
    expect(screen.queryByTestId('linha-processando')).toBeNull();
  });

  it('preserva o accessibilityState de quem chama (ex.: expanded)', async () => {
    await render(
      <ListRow onPress={() => {}} accessibilityLabel="Detalhes" accessibilityState={{ expanded: true }}>
        <Text>Detalhes</Text>
      </ListRow>
    );
    expect(screen.getByRole('button').props.accessibilityState).toMatchObject({ expanded: true });
  });

  it('tocar e segurar dispara onLongPress e expõe a dica', async () => {
    const onLongPress = jest.fn();
    await render(
      <ListRow onPress={() => {}} onLongPress={onLongPress} accessibilityLabel="Casa" accessibilityHint="Segure">
        <Text>Casa</Text>
      </ListRow>
    );
    const botao = screen.getByRole('button', { name: 'Casa' });
    expect(botao.props.accessibilityHint).toBe('Segure');
    await fireEvent(botao, 'longPress');
    expect(onLongPress).toHaveBeenCalled();
  });

  it('sem onPress: não é botão', async () => {
    await render(
      <ListRow>
        <Text>Só texto</Text>
      </ListRow>
    );
    expect(screen.getByText('Só texto')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('regressão (14/10): sem onPress, mas com rótulo, a linha é um elemento acessível com esse rótulo', async () => {
    // Antes o accessibilityLabel era descartado e os resumos do briefing (ônibus, trilhos, chuva…)
    // ficavam sem descrição para o leitor de tela.
    await render(
      <ListRow accessibilityLabel="Ônibus 875A-10 em 6 minutos" accessibilityHint="Resumo" testID="resumo">
        <Text>6 min</Text>
      </ListRow>
    );
    const linha = screen.getByTestId('resumo');
    expect(linha.props.accessible).toBe(true);
    expect(screen.getByLabelText('Ônibus 875A-10 em 6 minutos')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
