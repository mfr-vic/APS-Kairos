// Superfície de conteúdo (herói, grade do tempo, estados). Listas de linhas usam ListSection;
// o Cartao é para blocos que não são lista. Com onPress: escala 0,98 + fundo mais escuro no
// press-in (120 ms; só o fundo com movimento reduzido), toque protegido e háptica leve
// (useToqueProtegido); enquanto uma ação assíncrona roda, mostra um spinner no canto.
import { useState, type PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  Pressable,
  View,
  type AccessibilityState,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import type { TipoTatil } from '@/shared/feedback-tatil';
import { curvasCss, motion, radius, shadows, spacing, useColors } from '@/theme';

import { separarEstilo } from './separar-estilo';
import { useToqueProtegido, type AcaoDeToque } from './use-toque-protegido';

type Props = PropsWithChildren<{
  /** Pode devolver uma promessa: até ela terminar o cartão fica "processando". */
  onPress?: AcaoDeToque;
  /** Ação ao tocar e segurar. Só com onPress. */
  onLongPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
  /** Háptica do toque (padrão 'toque'); false = nenhuma. */
  tatil?: TipoTatil | false;
  /** Texto do aviso se a ação demorar. */
  avisoProcessando?: string;
  /** Sem padding interno (ex.: faixa horária que rola de borda a borda). */
  semPadding?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>;

export function Cartao({
  children,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  tatil = 'toque',
  avisoProcessando,
  semPadding = false,
  style,
  testID,
}: Props) {
  const c = useColors();
  const reduzido = useReducedMotion();
  const [pressionado, setPressionado] = useState(false);
  const { aoTocar, processando } = useToqueProtegido(onPress, { tatil, aviso: avisoProcessando });
  const base: ViewStyle = {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    boxShadow: shadows.card,
    padding: semPadding ? 0 : spacing.lg,
    gap: spacing.md,
    overflow: 'hidden',
  };
  if (!onPress) {
    return (
      <View
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        accessible={accessibilityLabel ? true : undefined}
        style={[base, style]}
      >
        {children}
      </View>
    );
  }
  const { fora, dentro } = separarEstilo(style);
  return (
    <Pressable
      testID={testID}
      style={fora}
      onPress={aoTocar}
      onLongPress={onLongPress}
      onPressIn={() => setPressionado(true)}
      onPressOut={() => setPressionado(false)}
      pressRetentionOffset={spacing.lg}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ ...accessibilityState, busy: processando || accessibilityState?.busy }}
    >
      <Animated.View
        testID={testID ? `${testID}-superficie` : 'cartao-superficie'}
        style={[
          base,
          {
            transform: [{ scale: pressionado && !reduzido ? motion.escalaCartao : 1 }],
            transitionProperty: reduzido ? ['backgroundColor'] : ['transform', 'backgroundColor'],
            transitionDuration: motion.toque,
            transitionTimingFunction: curvasCss.saida,
          },
          // Antes do `style`: superfície colorida de quem chama (ex.: herói) mantém a cor.
          pressionado && { backgroundColor: c.surfacePressed },
          dentro,
        ]}
      >
        {children}
        {processando ? (
          <ActivityIndicator
            testID="cartao-processando"
            size="small"
            color={c.textSecondary}
            style={{ position: 'absolute', top: spacing.sm, right: spacing.sm }}
          />
        ) : null}
      </Animated.View>
    </Pressable>
  );
}
