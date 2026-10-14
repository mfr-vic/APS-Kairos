// RF11: selo compacto do veredito (ícone + palavra, nunca só a cor), na lista de trajetos.
// A versão grande é o herói (heroi-veredito.tsx).
import type { Verdict } from '@kairos/contracts';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { fonts, radius, spacing, statusColors } from '@/theme';

import { VEREDITO } from './format';

type Props = { veredito: Verdict; style?: StyleProp<ViewStyle> };

export function VerdictBadge({ veredito, style }: Props) {
  const v = VEREDITO[veredito];
  return (
    <View
      accessible
      accessibilityLabel={`Último veredito: ${v.rotulo}`}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          alignSelf: 'flex-start',
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xxs,
          borderRadius: radius.full,
          backgroundColor: v.cor,
        },
        style,
      ]}
    >
      <Icon name={v.icone} size={16} color={statusColors.onStatus} />
      <ThemedText variant="caption" style={{ color: statusColors.onStatus, fontFamily: fonts.bold }}>
        {v.rotulo}
      </ThemedText>
    </View>
  );
}
