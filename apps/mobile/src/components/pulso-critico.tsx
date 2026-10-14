// Pulso sutil de opacidade SÓ para informação crítica (faixa/cartão AGUARDAR).
// Nunca decorativo; com movimento reduzido ativo, nada anima (fica estático).
import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

const PULSO = {
  from: { opacity: 1 },
  '50%': { opacity: 0.82 },
  to: { opacity: 1 },
};

type Props = PropsWithChildren<{ ativo: boolean; style?: StyleProp<ViewStyle> }>;

export function PulsoCritico({ ativo, style, children }: Props) {
  const reduzido = useReducedMotion();
  const anima = ativo && !reduzido;
  return (
    <Animated.View
      style={[
        style,
        anima && {
          animationName: PULSO,
          animationDuration: '1600ms',
          animationIterationCount: 'infinite',
          animationTimingFunction: 'ease-in-out',
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
