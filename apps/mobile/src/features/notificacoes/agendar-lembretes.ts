// RF25: agendamento LOCAL dos lembretes de saída com expo-notifications (sem push, sem servidor).
// Funciona no .apk e no iOS. No Expo Go do Android o módulo nem pode ser importado (ver
// modulo-notificacoes.ts): lá os lembretes ficam indisponíveis. Um gatilho semanal por dia útil (seg–sex).
// A sincronização é idempotente: apaga os lembretes agendados e agenda de novo o que deve existir
// (trajeto excluído ou renomeado, lembrete desligado, geral desligado, tudo cai no mesmo caminho).
import type { NotificationResponse } from 'expo-notifications';
import { Platform } from 'react-native';

import type { TrajetoSalvo } from '@/features/trajetos/trajeto-store';

import type { Lembretes } from './lembretes-store';
import { ACAO_PADRAO, notificacoes } from './modulo-notificacoes';

export const CANAL_LEMBRETES = 'lembretes-saida';
const PREFIXO_ID = 'lembrete-saida:';
/** Segunda a sexta no gatilho semanal (1 = domingo). */
const DIAS_UTEIS = [2, 3, 4, 5, 6];

export { suportaLembretes } from './modulo-notificacoes';

export type EstadoPermissao = 'concedida' | 'nao-pedida' | 'negada';

export const rotaDoBriefing = (id: string) => `/trajetos/${id}/briefing`;

export function textoDoLembrete(t: Pick<TrajetoSalvo, 'nome'>) {
  return { title: `Hora de decidir: ${t.nome}`, body: 'Toque para ver se é hora de sair' };
}

/** Android 8+: toda notificação precisa de canal; no Android 13 o pedido de permissão só aparece depois dele. */
async function garantirCanal() {
  const Notifications = notificacoes();
  if (Platform.OS !== 'android' || !Notifications) return;
  await Notifications.setNotificationChannelAsync(CANAL_LEMBRETES, {
    name: 'Lembretes de saída',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function lerPermissao(): Promise<EstadoPermissao> {
  const Notifications = notificacoes();
  if (!Notifications) return 'negada';
  const p = await Notifications.getPermissionsAsync();
  if (p.granted) return 'concedida';
  return p.canAskAgain ? 'nao-pedida' : 'negada';
}

/** Pede a permissão (só chamada quando a pessoa liga um lembrete). */
export async function pedirPermissao(): Promise<EstadoPermissao> {
  const Notifications = notificacoes();
  if (!Notifications) return 'negada';
  await garantirCanal();
  const p = await Notifications.requestPermissionsAsync();
  if (p.granted) return 'concedida';
  return p.canAskAgain ? 'nao-pedida' : 'negada';
}

/** Deixa agendado exatamente o que `lembretes` pede para os `trajetos` que existem. */
export async function sincronizarLembretes(
  lembretes: Lembretes,
  trajetos: readonly TrajetoSalvo[],
  permissao: EstadoPermissao
): Promise<number> {
  const Notifications = notificacoes();
  if (!Notifications) return 0;
  const agendados = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    agendados
      .filter((n) => n.identifier.startsWith(PREFIXO_ID))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );
  if (!lembretes.ativo || permissao !== 'concedida') return 0;
  await garantirCanal();
  let total = 0;
  for (const t of trajetos) {
    const l = lembretes.porTrajeto[t.id];
    if (!l) continue;
    for (const weekday of DIAS_UTEIS) {
      await Notifications.scheduleNotificationAsync({
        identifier: `${PREFIXO_ID}${t.id}:${weekday}`,
        content: { ...textoDoLembrete(t), data: { url: rotaDoBriefing(t.id) } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          channelId: CANAL_LEMBRETES,
          weekday,
          hour: l.hora,
          minute: l.minuto,
        },
      });
      total++;
    }
  }
  return total;
}

/** Rota a abrir para um toque em notificação (só os lembretes deste app, só rotas de briefing). */
export function rotaDaResposta(r: NotificationResponse | null | undefined): string | null {
  if (!r || r.actionIdentifier !== ACAO_PADRAO) return null;
  const url = r.notification.request.content.data?.url;
  return typeof url === 'string' && /^\/trajetos\/[^/]+\/briefing$/.test(url) ? url : null;
}
