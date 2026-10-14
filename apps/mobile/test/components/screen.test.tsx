// Screen: puxar para atualizar chama onRefresh e o indicador some quando a promessa resolve;
// o chip de estado de conexão fica no cabeçalho; o puxão vibra leve; o seletor do título abre
// uma vez só (toque protegido) e vibra seleção.
import { act, fireEvent, screen as tela } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import type { ReactElement } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/screen';
import { reiniciarFeedbackTatil } from '@/shared/feedback-tatil';

import { renderComQuery } from '../support/render-com-query';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

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

type PropsRefresh = { refreshing: boolean; onRefresh: () => void };
const refreshControl = () =>
  tela.getByTestId('rolagem-da-aba').props.refreshControl as ReactElement<PropsRefresh> | undefined;

describe('Screen', () => {
  it('com onRefresh, o RefreshControl dispara o refetch e volta a "não atualizando"', async () => {
    let resolver!: () => void;
    const onRefresh = jest.fn(() => new Promise<void>((r) => (resolver = r)));
    await renderComQuery(
      <Screen title="Trajetos" onRefresh={onRefresh}>
        <Text>conteúdo</Text>
      </Screen>
    );
    expect(refreshControl()!.props.refreshing).toBe(false);
    await act(async () => refreshControl()!.props.onRefresh());
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
    expect(refreshControl()!.props.refreshing).toBe(true);
    await act(async () => resolver());
    expect(refreshControl()!.props.refreshing).toBe(false);
    expect(tela.getByText('Online')).toBeTruthy(); // chip de estado no cabeçalho
  });

  it('seletor do título: duplo toque abre uma vez e vibra seleção', async () => {
    const abrir = jest.fn();
    await renderComQuery(
      <Screen title="Casa" onPressTitulo={abrir} rotuloSeletor="Trocar trajeto">
        <Text>x</Text>
      </Screen>
    );
    const seletor = tela.getByRole('button', { name: 'Trocar trajeto' });
    await fireEvent.press(seletor);
    await fireEvent.press(seletor);
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('sem onRefresh não há RefreshControl', async () => {
    await renderComQuery(
      <Screen title="Sobre">
        <Text>x</Text>
      </Screen>
    );
    expect(refreshControl()).toBeUndefined();
  });
});
