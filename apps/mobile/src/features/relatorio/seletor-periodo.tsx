// RF26: segmentado 7 · 30 dias (mesma forma do seletor de tema em Sobre).
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { PeriodoRelatorio } from '@/shared/api/relatorio';
import { feedbackTatil } from '@/shared/feedback-tatil';
import { alvoMinimo, radius, spacing, useColors } from '@/theme';

const PERIODOS: PeriodoRelatorio[] = [7, 30];

type Props = { valor: PeriodoRelatorio; onChange: (p: PeriodoRelatorio) => void };

export function SeletorPeriodo({ valor, onChange }: Props) {
  const c = useColors();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Período do relatório"
      style={{
        flexDirection: 'row',
        gap: spacing.xxs,
        backgroundColor: c.surfaceMuted,
        borderRadius: radius.md,
        borderCurve: 'continuous',
        padding: spacing.xxs,
      }}
    >
      {PERIODOS.map((p) => {
        const marcado = p === valor;
        return (
          <Pressable
            key={p}
            onPress={() => {
              if (marcado) return;
              feedbackTatil.selecao();
              onChange(p);
            }}
            accessibilityRole="radio"
            accessibilityLabel={`Últimos ${p} dias`}
            accessibilityState={{ checked: marcado }}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: alvoMinimo - spacing.sm,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.sm,
              borderCurve: 'continuous',
              backgroundColor: marcado ? c.accent : pressed ? c.surfacePressed : 'transparent',
            })}
          >
            <ThemedText variant="subheadStrong" tone={marcado ? 'onAccent' : 'textSecondary'}>
              {p} dias
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}
