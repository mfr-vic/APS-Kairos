// Como as telas empilhadas entram e saem (usado só por app/_layout.tsx). Funções puras, por
// plataforma, para os testes cobrirem a escolha que corrigiu o congelamento no Android.
//
// Por que NÃO usamos `presentation: 'formSheet'` no Android (defeito de 13/10/2026):
// tocar no título "Trajetos · MASP → Sé ▾" abria a rota `seletor-trajeto` como folha e o app
// congelava no Expo Go (só o botão de ferramentas do Expo respondia). No Android a formSheet do
// react-native-screens 4.26 é um BottomSheetBehavior do Material com camada de escurecimento
// própria, e a doc do Expo Router (SDK 57, "Modals › Android limitations") avisa que ela não
// suporta cabeçalho nativo nem pilha aninhada. Causas prováveis, lidas no código (o defeito não
// foi reproduzido em aparelho por quem corrigiu): com a folha sobre as NativeTabs, um 2º toque
// (o título não tinha trava) empilhava uma 2ª folha sobre a 1ª; e o `router.back()` seguido de
// `router.push()` no mesmo instante (escolher "Novo trajeto") desmontava a folha enquanto outra
// tela entrava. Os dois deixam a camada de escurecimento da folha capturando os toques sem folha
// visível, que é o sintoma relatado. A solução confiável no Android é a apresentação
// `modal` (equivale a `push` no Android, com cabeçalho nativo e botão de voltar) entrando de
// baixo; no iOS a folha nativa (UISheetPresentationController) continua, pois é estável.
// Além disso, toda rota empilhada é `dangerouslySingular` (ver _layout) e a navegação passa por
// `useNavegacao`, que ignora repetições enquanto a transição não termina.
import type { Platform } from 'react-native';

import { motion } from '@/theme/motion';

type SO = typeof Platform.OS;

/** Folha de escolha/ações: formSheet no iOS; tela modal com cabeçalho no Android e na web. */
export function opcoesFolha(os: SO, titulo: string, reduzido = false) {
  if (os === 'ios') {
    return {
      presentation: 'formSheet' as const,
      sheetAllowedDetents: [0.6, 1],
      sheetGrabberVisible: true,
      headerShown: false,
      title: titulo,
    };
  }
  return {
    presentation: 'modal' as const,
    headerShown: true,
    title: titulo,
    animation: reduzido ? ('fade' as const) : ('slide_from_bottom' as const),
    gestureEnabled: true,
  };
}

/** A folha desenha o próprio título? Só quando não há cabeçalho nativo (iOS). */
export function folhaTemTituloProprio(os: SO): boolean {
  return os === 'ios';
}

/**
 * Transição padrão das telas empilhadas: deslizar da direita (direção = "entrei em algo"),
 * com a duração de superfícies que entram de theme/motion (iOS; no Android a duração é a do
 * sistema). Com movimento reduzido, só fade. Voltar por gesto sempre ligado.
 */
export function opcoesPilha(os: SO, reduzido: boolean) {
  return {
    animation: reduzido
      ? ('fade' as const)
      : os === 'android'
        ? ('slide_from_right' as const)
        : ('default' as const),
    animationDuration: motion.slow,
    gestureEnabled: true,
    fullScreenGestureEnabled: os === 'ios',
  };
}
