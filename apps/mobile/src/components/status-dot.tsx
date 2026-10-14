// Estado por ponto colorido + texto (nunca só a cor). Cores da escala única de tons (theme/colors).
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { coresDoTom, radius, spacing, useColors, type Tom } from '@/theme';

import { ThemedText } from './themed-text';

export type StatusTom = Tom;

type Props = { tom: StatusTom; texto: string; style?: StyleProp<ViewStyle> };

export function StatusDot({ tom, texto, style }: Props) {
  const c = useColors();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, style]}>
      <View
        style={{
          width: spacing.sm,
          height: spacing.sm,
          borderRadius: radius.full,
          backgroundColor: coresDoTom(c, tom).fg,
        }}
      />
      <ThemedText variant="subheadStrong" tone="textSecondary">
        {texto}
      </ThemedText>
    </View>
  );
}
