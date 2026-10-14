// Linha de lista agrupada. Com onPress vira botão: o fundo acende no press-in (120 ms, sem
// "encolher" — linha de largura total que escala parece a tela inteira amassando). Toque protegido + háptica de seleção (useToqueProtegido);
// enquanto uma ação assíncrona roda, o chevron vira spinner e o estado fica "busy".
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  View,
  type AccessibilityState,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';

import type { TipoTatil } from '@/shared/feedback-tatil';
import { curvasCss, motion, spacing, useColors } from '@/theme';

import { Icon } from './icon';
import { separarEstilo } from './separar-estilo';
import { useToqueProtegido, type AcaoDeToque } from './use-toque-protegido';

type Props = {
  children: ReactNode;
  /** Pode devolver uma promessa: até ela terminar a linha fica "processando". */
  onPress?: AcaoDeToque;
  /** Ação secundária ao tocar e segurar (ex.: tornar principal). Só com onPress. */
  onLongPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Estado acessível (ex.: expanded das seções expansíveis). */
  accessibilityState?: AccessibilityState;
  /** Mostra a seta "›" de navegação. */
  chevron?: boolean;
  /** Háptica do toque (padrão 'selecao'); false = nenhuma. */
  tatil?: TipoTatil | false;
  /** Texto do aviso se a ação demorar. */
  avisoProcessando?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const BASE: ViewStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: spacing.md,
  minHeight: 48,
  paddingVertical: spacing.md,
  paddingHorizontal: spacing.lg,
};

export function ListRow({
  children,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  chevron = false,
  tatil = 'selecao',
  avisoProcessando,
  style,
  testID,
}: Props) {
  const c = useColors();
  const [pressionado, setPressionado] = useState(false);
  const { aoTocar, processando } = useToqueProtegido(onPress, { tatil, aviso: avisoProcessando });

  const acessorio = processando ? (
    <ActivityIndicator testID="linha-processando" size="small" color={c.textSecondary} />
  ) : chevron ? (
    <Icon name="chevron" size={20} color={c.textSecondary} />
  ) : null;

  if (!onPress) {
    // Sem toque, mas com rótulo: a linha vira UM elemento acessível (o leitor lê o resumo inteiro).
    // Antes o rótulo era descartado e os resumos do briefing ficavam sem descrição.
    const comRotulo = accessibilityLabel !== undefined;
    return (
      <View
        testID={testID}
        style={[BASE, style]}
        accessible={comRotulo || undefined}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={accessibilityState}
      >
        {children}
        {acessorio}
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
      {/* A cor muda por transição CSS (UI thread), igual com ou sem movimento reduzido. */}
      <Animated.View
        style={[
          BASE,
          {
            backgroundColor: pressionado ? c.surfacePressed : 'transparent',
            transitionProperty: 'backgroundColor',
            transitionDuration: motion.toque,
            transitionTimingFunction: curvasCss.saida,
          },
          dentro,
        ]}
      >
        {children}
        {acessorio}
      </Animated.View>
    </Pressable>
  );
}
