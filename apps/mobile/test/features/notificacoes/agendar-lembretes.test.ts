// RF25: agendamento local idempotente (seg–sex, gatilho semanal) e rota do toque na notificação.
import * as N from 'expo-notifications';

import {
  lerPermissao,
  rotaDaResposta,
  sincronizarLembretes,
  textoDoLembrete,
} from '@/features/notificacoes/agendar-lembretes';

import { TRAJETO_EXEMPLO as t } from '../../support/trajeto';

// expo-notifications vem simulado para todos os testes (moduleNameMapper do package.json)

const mocks = N as unknown as Record<string, jest.Mock>;
const L = { hora: 7, minuto: 40, origem: 'habitual' as const, habitual: { hora: 7, minuto: 50 } };

describe('sincronizarLembretes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocks.getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: 'lembrete-saida:velho:2' },
      { identifier: 'outra-coisa' },
    ]);
  });

  it('cancela só os lembretes do app e agenda 5 semanais (seg–sex) com título, corpo e rota', async () => {
    const n = await sincronizarLembretes({ ativo: true, porTrajeto: { t1: L, sumiu: L } }, [t], 'concedida');
    expect(n).toBe(5);
    expect(mocks.cancelScheduledNotificationAsync.mock.calls).toEqual([['lembrete-saida:velho:2']]);
    const pedidos = mocks.scheduleNotificationAsync.mock.calls.map((c) => c[0]);
    expect(pedidos.map((p) => p.trigger.weekday)).toEqual([2, 3, 4, 5, 6]);
    expect(pedidos[0]).toEqual({
      identifier: 'lembrete-saida:t1:2',
      content: {
        title: 'Hora de decidir: Casa → Faculdade',
        body: 'Toque para ver se é hora de sair',
        data: { url: '/trajetos/t1/briefing' },
      },
      trigger: { type: 'weekly', channelId: 'lembretes-saida', weekday: 2, hour: 7, minute: 40 },
    });
  });

  it('geral desligado ou sem permissão: só cancela', async () => {
    expect(await sincronizarLembretes({ ativo: false, porTrajeto: { t1: L } }, [t], 'concedida')).toBe(0);
    expect(await sincronizarLembretes({ ativo: true, porTrajeto: { t1: L } }, [t], 'negada')).toBe(0);
    expect(mocks.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(mocks.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);
  });
});

describe('lerPermissao', () => {
  it('mapeia concedida / não pedida / negada', async () => {
    mocks.getPermissionsAsync.mockResolvedValueOnce({ granted: true, canAskAgain: true });
    expect(await lerPermissao()).toBe('concedida');
    mocks.getPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: true });
    expect(await lerPermissao()).toBe('nao-pedida');
    mocks.getPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: false });
    expect(await lerPermissao()).toBe('negada');
  });
});

describe('rotaDaResposta', () => {
  const resposta = (url: unknown, acao = N.DEFAULT_ACTION_IDENTIFIER) =>
    ({ actionIdentifier: acao, notification: { request: { content: { data: { url } } } } }) as never;

  it('só abre rota de briefing, só no toque padrão', () => {
    expect(rotaDaResposta(resposta('/trajetos/t1/briefing'))).toBe('/trajetos/t1/briefing');
    expect(rotaDaResposta(resposta('https://exemplo.com'))).toBeNull();
    expect(rotaDaResposta(resposta('/trajetos/t1/briefing', 'outra'))).toBeNull();
    expect(rotaDaResposta(null)).toBeNull();
  });

  it('texto curto com o nome do trajeto', () => {
    expect(textoDoLembrete(t).title).toBe('Hora de decidir: Casa → Faculdade');
  });
});
