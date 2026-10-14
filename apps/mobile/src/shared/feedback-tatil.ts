// Háptica (expo-haptics) com semântica única no app:
// uma por ação, no mesmo instante do visual e NUNCA como único retorno (sempre há snackbar ou
// mudança na tela).
//
//   toque      → ação disparada (botão, cartão tocável)           impacto leve
//   selecao    → escolha/alternância (aba, segmentado, item, toggle) seleção
//   sucesso    → ação concluída (salvar, tornar principal, desfazer)  notificação de sucesso
//   aviso      → algo pede atenção sem ser falha (toque repetido em espera) notificação de aviso
//   erro       → falha de uma ação pedida pela pessoa             notificação de erro
//   destrutivo → ação destrutiva disparada (excluir)             impacto médio
//
// Android: usa o motor de háptica do sistema (`performAndroidHapticsAsync`, sem permissão
// VIBRATE e respeitando o "retorno tátil" do aparelho), que é bem mais fino que o Vibrator
// usado pelas funções genéricas; tipos que só existem no Android 11+ (API 30) caem no genérico.
// Web: no-op. Falha do módulo nunca derruba a ação.
//
// NÃO segue o movimento reduzido (é outro sentido). Pode ser desligada pela pessoa:
// `definirHapticaAtiva(false)` persiste em `kairos:haptica:v1`.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export const CHAVE_HAPTICA = 'kairos:haptica:v1';

export type TipoTatil = 'toque' | 'selecao' | 'sucesso' | 'aviso' | 'erro' | 'destrutivo';

let ativa = true;
let carregada: Promise<void> | null = null;
/** Conta os disparos: os componentes usam para saber se o handler já vibrou (um por ação). */
let disparos = 0;

/** Lê a preferência salva uma vez (até ler, vale "ligada", o padrão). */
export function carregarPreferenciaTatil(): Promise<void> {
  carregada ??= AsyncStorage.getItem(CHAVE_HAPTICA)
    .then((v) => {
      if (v === 'off') ativa = false;
    })
    .catch(() => {});
  return carregada;
}

export function hapticaAtiva(): boolean {
  return ativa;
}

export async function definirHapticaAtiva(valor: boolean): Promise<void> {
  ativa = valor;
  carregada = Promise.resolve();
  try {
    await AsyncStorage.setItem(CHAVE_HAPTICA, valor ? 'on' : 'off');
  } catch {
    // sem armazenamento: vale só nesta sessão
  }
}

/** Só para testes. */
export function reiniciarFeedbackTatil() {
  ativa = true;
  carregada = null;
  disparos = 0;
}

/** Marca atual dos disparos (compare antes/depois de chamar um handler). */
export function marcaTatil(): number {
  return disparos;
}

const API_HAPTICA_ANDROID_NOVA = 30;

function android(tipo: TipoTatil): Haptics.AndroidHaptics | null {
  const A = Haptics.AndroidHaptics;
  if (!A) return null;
  const nova = typeof Platform.Version === 'number' && Platform.Version >= API_HAPTICA_ANDROID_NOVA;
  switch (tipo) {
    case 'toque':
      return A.Virtual_Key;
    case 'selecao':
      return A.Clock_Tick;
    case 'destrutivo':
      return A.Long_Press;
    case 'sucesso':
      return nova ? A.Confirm : null;
    case 'aviso':
    case 'erro':
      return nova ? A.Reject : null;
  }
}

function generico(tipo: TipoTatil): Promise<void> {
  switch (tipo) {
    case 'toque':
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    case 'selecao':
      return Haptics.selectionAsync();
    case 'destrutivo':
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    case 'sucesso':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    case 'aviso':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    case 'erro':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }
}

/** Dispara a háptica do tipo pedido (ou nada, se desligada / web / módulo ausente). */
export function vibrar(tipo: TipoTatil): void {
  void carregarPreferenciaTatil();
  if (!ativa || Platform.OS === 'web') return;
  disparos++;
  try {
    const nativo = Platform.OS === 'android' ? android(tipo) : null;
    const p = nativo != null ? Haptics.performAndroidHapticsAsync(nativo) : generico(tipo);
    p?.catch?.(() => {});
  } catch {
    // módulo ausente (ex.: build sem o nativo): segue sem vibrar
  }
}

export const feedbackTatil = {
  /** Ação disparada (botão, cartão). */
  toque: () => vibrar('toque'),
  /** Toque longo reconhecido, item escolhido numa lista, alternância. */
  selecao: () => vibrar('selecao'),
  /** Confirmação de ação concluída (salvar, tornar principal, desfazer). */
  sucesso: () => vibrar('sucesso'),
  /** Pede atenção sem ser falha (ex.: toque repetido enquanto a ação anterior roda). */
  aviso: () => vibrar('aviso'),
  /** Ação destrutiva disparada (excluir). */
  destrutivo: () => vibrar('destrutivo'),
  /** Falha de uma ação pedida pela pessoa. */
  erro: () => vibrar('erro'),
};
