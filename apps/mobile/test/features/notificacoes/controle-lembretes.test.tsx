// RF25: interruptor geral em Sobre, com o estado da permissão e a saída para as configurações.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as N from 'expo-notifications';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { ControleLembretes } from '@/features/notificacoes/controle-lembretes';
import { lembretesStore } from '@/features/notificacoes/use-lembretes';

import { renderComQuery } from '../../support/render-com-query';

// expo-notifications vem simulado para todos os testes (moduleNameMapper do package.json)
jest.mock('@/components/snackbar', () => ({ useSnackbar: () => ({ mostrar: jest.fn(), ocultar: jest.fn() }) }));

const mocks = N as unknown as Record<string, jest.Mock>;
const L = { hora: 7, minuto: 40, origem: 'manual' as const, habitual: null };

describe('ControleLembretes', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('mostra quantos trajetos têm lembrete e a permissão; desligar não apaga os horários', async () => {
    mocks.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    await lembretesStore.definir('t1', L);
    await renderComQuery(<ControleLembretes />);
    expect(await screen.findByText('1 trajeto com lembrete · Notificações permitidas')).toBeTruthy();
    const sw = screen.getByRole('switch', { name: 'Lembretes de saída' });
    await act(() => fireEvent(sw, 'valueChange', false));
    const salvo = await lembretesStore.ler();
    expect(salvo.ativo).toBe(false);
    expect(salvo.porTrajeto.t1).toEqual(L);
  });

  it('permissão bloqueada: oferece abrir as configurações do aparelho', async () => {
    mocks.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
    const abrir = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await renderComQuery(<ControleLembretes />);
    expect(await screen.findByText(/Notificações bloqueadas nas configurações do aparelho/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /Abrir configurações do aparelho/ }));
    expect(abrir).toHaveBeenCalled();
  });
});
