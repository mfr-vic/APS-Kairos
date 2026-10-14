// RF25: montado uma vez no layout raiz. (1) Toque na notificação → abre o briefing do trajeto,
// com o app aberto ou frio (padrão da doc do expo-notifications para o Expo Router);
// (2) mantém os agendamentos iguais às preferências e à lista de trajetos (excluir, renomear,
// desligar e Desfazer reagendam sozinhos). Não desenha nada.
import type { NotificationResponse } from 'expo-notifications';
import type { Href } from 'expo-router';
import { useEffect } from 'react';

import { useTrajetos } from '@/features/trajetos/use-trajetos';
import { useNavegacao } from '@/shared/navegacao/use-navegacao';

import { rotaDaResposta, sincronizarLembretes } from './agendar-lembretes';
import { notificacoes } from './modulo-notificacoes';
import { useLembretes, usePermissaoLembretes } from './use-lembretes';

let fila: Promise<unknown> = Promise.resolve();

export function LembretesDeSaida() {
  const nav = useNavegacao();
  const trajetos = useTrajetos().data;
  const lembretes = useLembretes().data;
  const permissao = usePermissaoLembretes().data;

  useEffect(() => {
    const Notifications = notificacoes();
    if (!Notifications) return; // web ou Expo Go no Android
    // Com o app aberto, o lembrete aparece como banner (sem som extra).
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    const abrir = (r: NotificationResponse | null) => {
      const rota = rotaDaResposta(r);
      if (!rota) return;
      nav.empurrar(rota as Href);
      Notifications.clearLastNotificationResponse(); // não reabre ao remontar
    };
    // Este componente vive no layout RAIZ: um erro do módulo de notificações (recurso opcional) não pode
    // derrubar o app inteiro. Regressão de 14/10/2026: getLastNotificationResponse lançou fora do mock.
    let sub: { remove(): void } | undefined;
    try {
      abrir(Notifications.getLastNotificationResponse());
      sub = Notifications.addNotificationResponseReceivedListener(abrir);
    } catch (erro) {
      console.warn('[lembretes] notificações indisponíveis; o app segue sem abrir pelo toque', erro);
    }
    return () => sub?.remove();
  }, [nav]);

  // Assinatura do que importa para o agendamento: só reagenda quando algo dela muda.
  const assinatura =
    lembretes && trajetos && permissao
      ? JSON.stringify([permissao, lembretes, trajetos.map((t) => [t.id, t.nome])])
      : null;

  useEffect(() => {
    if (!assinatura || !lembretes || !trajetos || !permissao) return;
    // Em fila: duas sincronizações intercaladas poderiam deixar um lembrete que já foi desligado.
    fila = fila
      .then(() => sincronizarLembretes(lembretes, trajetos, permissao))
      .catch((e) => console.warn('[lembretes] falha ao agendar', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a assinatura cobre os dados
  }, [assinatura]);

  return null;
}
