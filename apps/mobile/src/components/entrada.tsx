// Entrada das seções (fade + 8 px para cima, 250 ms, ease-out) e transição de layout ao
// expandir/recolher (200 ms). Propósito: mostrar que o conteúdo chegou / mudou de tamanho
// sem salto. Com movimento reduzido, nada anima (props de animação ficam indefinidas).
// Também os builders de lista: entrada escalonada (40 ms por item, no máximo 6 degraus),
// saída de item removido (fade 150 ms) e a transição dos vizinhos que sobem no lugar.
import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  useReducedMotion,
} from 'react-native-reanimated';

import { curvas, motion } from '@/theme';

const EASE_OUT = Easing.bezier(...curvas.saida);
const EASE_MOVE = Easing.bezier(...curvas.movimento);

// Builders no escopo do módulo (a doc do Reanimated pede para não recriá-los a cada render).
export const ENTRADA_SECAO = FadeInDown.duration(motion.slow)
  .easing(EASE_OUT)
  .withInitialValues({ opacity: 0, transform: [{ translateY: motion.entradaY }] })
  .reduceMotion(ReduceMotion.System);

export const ENTRADA_DETALHE = FadeIn.duration(motion.base)
  .easing(EASE_OUT)
  .reduceMotion(ReduceMotion.System);

/** Conteúdo recolhido ("Ver menos") ou item removido: some ~20 % mais rápido do que entrou. */
export const SAIDA_DETALHE = FadeOut.duration(motion.fast)
  .easing(EASE_OUT)
  .reduceMotion(ReduceMotion.System);

export const TRANSICAO_LAYOUT = LinearTransition.duration(motion.base)
  .easing(EASE_MOVE)
  .reduceMotion(ReduceMotion.System);

// Um builder por degrau, criados uma vez: índice ≥ máximo entra junto com o último degrau.
const ENTRADAS_ESCALONADAS = Array.from({ length: motion.escalonamentoMaxItens }, (_, i) =>
  FadeInDown.duration(motion.slow)
    .delay(i * motion.escalonamento)
    .easing(EASE_OUT)
    .withInitialValues({ opacity: 0, transform: [{ translateY: motion.entradaY }] })
    .reduceMotion(ReduceMotion.System)
);

/** Entrada do item `indice` de uma lista (stagger curto, limitado). */
export function entradaEscalonada(indice: number) {
  const i = Math.min(Math.max(0, Math.floor(indice)), motion.escalonamentoMaxItens - 1);
  return ENTRADAS_ESCALONADAS[i];
}

type Props = PropsWithChildren<{
  /** Também anima a mudança de altura (seções expansíveis). */
  comLayout?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>;

export function Entrada({ children, comLayout = false, style, testID }: Props) {
  const reduzido = useReducedMotion();
  return (
    <Animated.View
      testID={testID}
      entering={reduzido ? undefined : ENTRADA_SECAO}
      layout={reduzido || !comLayout ? undefined : TRANSICAO_LAYOUT}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

/** Conteúdo revelado ao expandir ("Ver detalhes"): só fade ao entrar e ao recolher. */
export function Revelar({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const reduzido = useReducedMotion();
  return (
    <Animated.View
      entering={reduzido ? undefined : ENTRADA_DETALHE}
      exiting={reduzido ? undefined : SAIDA_DETALHE}
      style={style}
    >
      {children}
    </Animated.View>
  );
}
