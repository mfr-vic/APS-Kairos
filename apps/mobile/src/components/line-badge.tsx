// Identificação de linha como nos apps de transporte: bolinha colorida com o número (Metrô/trem)
// ou chip com o letreiro (ônibus). O nome completo vai no rótulo de acessibilidade.
import type { RailLine } from '@kairos/contracts';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { fonts, lineColorFallback, lineColors, radius, spacing, useColors } from '@/theme';

import { Icon } from './icon';
import { ThemedText } from './themed-text';

type Props = // Sem `rotulo`, a bolinha é decorativa (ex.: dentro de um controle que já tem rótulo).
({ tipo: 'trilho'; linha: RailLine; rotulo?: string } | { tipo: 'onibus'; letreiro: string }) & {
  tamanho?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
};

export function LineBadge(props: Props) {
  const c = useColors();
  const md = (props.tamanho ?? 'md') === 'md';
  const altura = md ? 28 : 24;

  if (props.tipo === 'trilho') {
    const cor = lineColors[props.linha] ?? lineColorFallback;
    return (
      <View
        accessible={!!props.rotulo}
        accessibilityLabel={props.rotulo}
        importantForAccessibility={props.rotulo ? 'auto' : 'no-hide-descendants'}
        style={[
          {
            minWidth: altura,
            height: altura,
            paddingHorizontal: spacing.xs,
            borderRadius: radius.full,
            backgroundColor: cor.bg,
            alignItems: 'center',
            justifyContent: 'center',
          },
          props.style,
        ]}
      >
        <ThemedText
          variant={md ? 'subheadStrong' : 'caption'}
          style={{ color: cor.on, fontFamily: fonts.bold }}
        >
          {props.linha.slice(1)}
        </ThemedText>
      </View>
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={`Ônibus ${props.letreiro}`}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          height: altura,
          paddingHorizontal: spacing.sm,
          borderRadius: radius.sm,
          borderCurve: 'continuous',
          backgroundColor: c.brand,
        },
        props.style,
      ]}
    >
      <Icon name="onibus" size={16} color={c.onBrand} />
      <ThemedText
        variant={md ? 'subheadStrong' : 'caption'}
        tone="onBrand"
        style={{ fontFamily: fonts.bold }}
      >
        {props.letreiro}
      </ThemedText>
    </View>
  );
}
