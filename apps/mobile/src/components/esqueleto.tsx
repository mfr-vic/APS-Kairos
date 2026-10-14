// Esqueleto com a forma do conteúdo que vai chegar (sem spinner). Brilho discreto: a opacidade
// respira 1 → 0,55 → 1 em 1,4 s (animação CSS do Reanimated, na UI thread), só enquanto o
// esqueleto existe — é o sinal de "está vindo", não decoração. Com movimento reduzido, fica
// estático. Os blocos são escondidos da leitura de tela; quem usa põe um rótulo no contêiner
// dizendo o que está sendo consultado.
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { curvasCss, motion, radius, useColors } from '@/theme';

/** Keyframes no escopo do módulo (não recriar a cada render). */
export const BRILHO_ESQUELETO = {
  from: { opacity: 1 },
  '50%': { opacity: 0.55 },
  to: { opacity: 1 },
};

type Props = {
  largura: DimensionValue;
  altura: number;
  /** Bloco sobre uma superfície colorida (herói): usa um tom translúcido. */
  sobreCor?: boolean;
  redondo?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Esqueleto({ largura, altura, sobreCor = false, redondo = false, style }: Props) {
  const c = useColors();
  const reduzido = useReducedMotion();
  return (
    <Animated.View
      testID="esqueleto"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: largura,
          height: altura,
          borderRadius: redondo ? radius.full : radius.sm,
          backgroundColor: sobreCor ? 'rgba(255, 255, 255, 0.22)' : c.surfaceMuted,
        },
        !reduzido && {
          animationName: BRILHO_ESQUELETO,
          animationDuration: motion.brilhoEsqueleto,
          animationIterationCount: 'infinite',
          animationTimingFunction: curvasCss.movimento,
        },
        style,
      ]}
    />
  );
}
