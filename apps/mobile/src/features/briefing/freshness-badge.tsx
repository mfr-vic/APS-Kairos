// RF12 / TC15: recência de uma observação ("há N min"), com destaque para stale/unavailable.
import type { DataState } from '@kairos/contracts';
import { View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { fonts, radius, spacing, statusColors, useColors } from '@/theme';

import { haQuantoTempo } from './format';

type Props = {
  status: DataState;
  observedAt: string | null;
  agora: number;
};

export function FreshnessBadge({ status, observedAt, agora }: Props) {
  const c = useColors();
  const idade = observedAt ? haQuantoTempo(observedAt, agora) : null;

  if (status === 'fresh') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        {/* "ao vivo": ponto verde + texto */}
        <View
          style={{
            width: spacing.sm,
            height: spacing.sm,
            borderRadius: radius.full,
            backgroundColor: c.fgOk,
          }}
        />
        <ThemedText variant="caption" tone="textSecondary">
          {idade ?? 'sem horário'}
        </ThemedText>
      </View>
    );
  }

  const destaque = status === 'stale' ? statusColors.atencao : statusColors.aguardar;
  const texto =
    status === 'stale'
      ? `desatualizado · ${idade ?? 'sem horário'}`
      : idade
        ? `indisponível · último dado ${idade}`
        : 'indisponível';

  return (
    <View
      accessibilityLabel={`Dado ${texto}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xxs,
        borderRadius: radius.full,
        backgroundColor: destaque,
      }}
    >
      <Icon
        name={status === 'stale' ? 'desatualizado' : 'remover'}
        size={16}
        color={statusColors.onStatus}
      />
      <ThemedText variant="caption" style={{ color: statusColors.onStatus, fontFamily: fonts.bold }}>
        {texto}
      </ThemedText>
    </View>
  );
}
