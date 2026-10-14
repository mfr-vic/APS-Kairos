// RF25: toque no lembrete abre o briefing (app frio e app aberto) e o agendamento segue os trajetos.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as N from 'expo-notifications';
import { act, waitFor } from '@testing-library/react-native';

import { LembretesDeSaida } from '@/features/notificacoes/lembretes-de-saida';
import { lembretesStore } from '@/features/notificacoes/use-lembretes';
import { CHAVE_TRAJETOS } from '@/features/trajetos/storage';

import { renderComQuery } from '../../support/render-com-query';
import { TRAJETO_EXEMPLO as t } from '../../support/trajeto';

// expo-notifications vem simulado para todos os testes (moduleNameMapper do package.json)
const mockEmpurrar = jest.fn();
jest.mock('@/shared/navegacao/use-navegacao', () => {
  const nav = { empurrar: (h: unknown) => mockEmpurrar(h) };
  return { useNavegacao: () => nav };
});

const mocks = N as unknown as Record<string, jest.Mock>;
const resposta = (url: string) => ({
  actionIdentifier: N.DEFAULT_ACTION_IDENTIFIER,
  notification: { request: { content: { data: { url } } } },
});

/** Espera as leituras locais e a 1ª sincronização (evita atualização fora de act). */
const assentar = () => waitFor(() => expect(mocks.getAllScheduledNotificationsAsync).toHaveBeenCalled());

describe('LembretesDeSaida', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('app aberto pelo toque (frio): abre o briefing uma vez e limpa a resposta', async () => {
    mocks.getLastNotificationResponse.mockReturnValueOnce(resposta('/trajetos/t1/briefing'));
    await renderComQuery(<LembretesDeSaida />);
    expect(mockEmpurrar).toHaveBeenCalledWith('/trajetos/t1/briefing');
    expect(mocks.clearLastNotificationResponse).toHaveBeenCalled();
    await assentar();
  });

  it('regressão (14/10): erro do módulo de notificações não derruba o layout raiz', async () => {
    // O real lançou "Cannot read properties of undefined (reading 'request')" no teste da navegação.
    mocks.getLastNotificationResponse.mockImplementationOnce(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'request')");
    });
    const aviso = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(renderComQuery(<LembretesDeSaida />)).resolves.toBeTruthy();
    expect(mockEmpurrar).not.toHaveBeenCalled();
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining('[lembretes]'), expect.any(TypeError));
    aviso.mockRestore();
    await assentar();
  });

  it('app já aberto: o ouvinte abre o briefing', async () => {
    await renderComQuery(<LembretesDeSaida />);
    const ouvinte = mocks.addNotificationResponseReceivedListener.mock.calls[0][0];
    await act(async () => ouvinte(resposta('/trajetos/t9/briefing')));
    expect(mockEmpurrar).toHaveBeenCalledWith('/trajetos/t9/briefing');
    await assentar();
  });

  it('agenda os lembretes dos trajetos existentes quando há permissão', async () => {
    mocks.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    await AsyncStorage.setItem(CHAVE_TRAJETOS, JSON.stringify([t]));
    await lembretesStore.definir('t1', { hora: 7, minuto: 40, origem: 'manual', habitual: null });
    await renderComQuery(<LembretesDeSaida />);
    await waitFor(() => expect(mocks.scheduleNotificationAsync).toHaveBeenCalledTimes(5));
  });
});
