// Chips de filtro das camadas do mapa (múltipla escolha) e a legenda com o impacto de cada camada
// ligada. Chip: fundo e marca trocam em 150 ms (transição CSS do Reanimated), háptica de seleção.
import type { MapaCamadasResponse } from '@kairos/contracts';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { feedbackTatil } from '@/shared/feedback-tatil';
import { curvasCss, motion, radius, spacing, useColors } from '@/theme';

import { CAMADAS, legendaDaCamada, type CamadaMapa } from './camadas-mapa';

type Props = {
  filtros: readonly CamadaMapa[];
  onAlternar: (c: CamadaMapa) => void;
  dados: MapaCamadasResponse | undefined;
  carregando: boolean;
  erro: string | null;
};

export function FiltrosCamadas({ filtros, onAlternar, dados, carregando, erro }: Props) {
  const c = useColors();
  const reduzido = useReducedMotion();
  return (
    <View style={{ backgroundColor: c.surface, paddingVertical: spacing.sm, gap: spacing.xs }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: 'center' }}
      >
        {CAMADAS.map((camada) => {
          const ligado = filtros.includes(camada.id);
          return (
            <Pressable
              key={camada.id}
              testID={`filtro-${camada.id}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: ligado }}
              accessibilityLabel={`Camada ${camada.rotulo}`}
              hitSlop={spacing.xs}
              onPress={() => {
                feedbackTatil.selecao();
                onAlternar(camada.id);
              }}
            >
              {({ pressed }) => (
                <Animated.View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.xs,
                    minHeight: 36,
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.full,
                    borderWidth: 1,
                    borderColor: ligado ? c.accent : c.separator,
                    backgroundColor: pressed ? c.surfacePressed : ligado ? c.accent : c.surfaceMuted,
                    transform: [{ scale: pressed && !reduzido ? motion.escalaBotao : 1 }],
                    transitionProperty: reduzido ? ['backgroundColor'] : ['backgroundColor', 'transform'],
                    transitionDuration: motion.fast,
                    transitionTimingFunction: curvasCss.saida,
                  }}
                >
                  <Icon name={ligado ? 'marcado' : camada.icone} size={16} color={ligado ? c.onAccent : c.tint} />
                  <ThemedText variant="subheadStrong" tone={ligado ? 'onAccent' : 'text'}>
                    {camada.rotulo}
                  </ThemedText>
                </Animated.View>
              )}
            </Pressable>
          );
        })}
        {carregando && filtros.length > 0 ? (
          <ActivityIndicator testID="camadas-carregando" size="small" color={c.tint} accessibilityLabel="Carregando camadas" />
        ) : null}
      </ScrollView>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.xxs }} accessibilityLiveRegion="polite">
        {erro && filtros.length > 0 ? (
          <ThemedText variant="caption" tone="fgErro">
            Camadas indisponíveis: {erro}
          </ThemedText>
        ) : (
          CAMADAS.filter((x) => filtros.includes(x.id)).map((x) =>
            dados || x.id === 'transito' ? (
              <ThemedText key={x.id} variant="caption" tone="textSecondary">
                <ThemedText variant="caption" tone="text">
                  {x.rotulo}:{' '}
                </ThemedText>
                {legendaDaCamada(x.id, dados)}
              </ThemedText>
            ) : null
          )
        )}
      </View>
    </View>
  );
}
