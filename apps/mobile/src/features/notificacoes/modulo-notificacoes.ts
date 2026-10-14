// Carrega o expo-notifications SOB DEMANDA e só onde ele funciona.
// Defeito de 14/10/2026: no Expo Go do Android (SDK 53+), só IMPORTAR o módulo lança
// "Android Push notifications ... was removed from Expo Go" (o módulo registra push ao carregar).
// Como os lembretes vivem no layout raiz, o import estático derrubava o app inteiro no Expo Go.
// No .apk (e no iOS) o módulo carrega normalmente e os lembretes locais funcionam.
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type * as ExpoNotifications from 'expo-notifications';
import { Platform } from 'react-native';

export type Notificacoes = typeof ExpoNotifications;

/** Rodando dentro do app Expo Go no Android (onde o módulo não pode ser carregado). */
export const noExpoGoAndroid =
  Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export const suportaLembretes = Platform.OS !== 'web' && !noExpoGoAndroid;

let modulo: Notificacoes | undefined;

/** O módulo, ou null onde não há suporte (web, Expo Go no Android). */
export function notificacoes(): Notificacoes | null {
  if (!suportaLembretes) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- import sob demanda é o objetivo
  modulo ??= require('expo-notifications') as Notificacoes;
  return modulo;
}

/** `DEFAULT_ACTION_IDENTIFIER` sem importar o módulo (o tipo literal faz o tsc acusar se mudar). */
export const ACAO_PADRAO: typeof ExpoNotifications.DEFAULT_ACTION_IDENTIFIER = 'expo.modules.notifications.actions.DEFAULT';
