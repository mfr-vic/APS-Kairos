// "Próximas horas": coluna por hora com temperatura, ícone, chuva (pílula no tom da B.8:
// moderada = Atenção, forte = Aguardar) e chance. A coluna "Agora" fica realçada em neutro e a
// melhor janela do briefing em cor de decisão, com a palavra "Janela" — sem legenda à parte.
import type { WeatherValue, WeatherWindow } from '@kairos/contracts';
import { ScrollView, View } from 'react-native';

import { Cartao } from '@/components/cartao';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { decimal, horaSP } from '@/features/briefing/format';
import { tomDaChuva } from '@/features/briefing/leituras';
import { coresDoTom, radius, spacing, statusColors, useColors } from '@/theme';

import { iconeDaHora } from './codigo-tempo';

type Hora = WeatherValue['horas'][number];

const INTENSIDADE = { ok: 'fraca ou nenhuma', atencao: 'moderada', erro: 'forte', neutro: '' } as const;
const HORA_MS = 60 * 60 * 1000;

type Props = {
  horas: Hora[];
  agora: number;
  janela?: WeatherWindow;
};

/** A hora em curso (início ≤ agora < início + 1 h) e se a coluna cai na janela recomendada. */
export function marcarHoras(horas: Hora[], agora: number, janela?: WeatherWindow) {
  return horas.map((h) => {
    const t = Date.parse(h.hora);
    return {
      hora: h,
      agora: t <= agora && agora < t + HORA_MS,
      naJanela: !!janela && t >= Date.parse(janela.inicio) && t < Date.parse(janela.fim),
    };
  });
}

export function ProximasHoras({ horas, agora, janela }: Props) {
  const c = useColors();
  if (horas.length === 0) return null;
  return (
    <Cartao semPadding>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.xs, padding: spacing.md }}
      >
        {marcarHoras(horas, agora, janela).map(({ hora: h, agora: ehAgora, naJanela }) => {
          const tom = tomDaChuva(h.precipitacaoMm);
          const solido = tom === 'ok' ? null : coresDoTom(c, tom).solido;
          const rotuloHora = ehAgora ? 'Agora' : horaSP(h.hora);
          return (
            <View
              key={h.hora}
              testID={naJanela ? 'coluna-janela' : ehAgora ? 'coluna-agora' : undefined}
              accessible
              accessibilityLabel={[
                `${rotuloHora}: ${decimal(h.temperaturaC, 0)} graus`,
                `chuva ${INTENSIDADE[tom]}, ${decimal(h.precipitacaoMm)} milímetros por hora`,
                h.probabilidadePrecipitacao !== null ? `${h.probabilidadePrecipitacao}% de chance` : null,
                naJanela ? 'melhor horário para sair' : null,
              ]
                .filter(Boolean)
                .join(', ')}
              style={{
                width: 64,
                alignItems: 'center',
                gap: spacing.xs,
                paddingVertical: spacing.sm,
                borderRadius: radius.md,
                borderCurve: 'continuous',
                borderWidth: 2,
                borderColor: naJanela ? c.tint : 'transparent',
                backgroundColor: naJanela ? c.decisaoSoft : ehAgora ? c.surfaceMuted : 'transparent',
              }}
            >
              <ThemedText variant={ehAgora ? 'subheadStrong' : 'caption'} tone={ehAgora ? 'text' : 'textSecondary'}>
                {rotuloHora}
              </ThemedText>
              <Icon name={iconeDaHora(h)} size={24} color={c.tint} />
              <ThemedText variant="bodyStrong">{decimal(h.temperaturaC, 0)}°</ThemedText>
              <View
                style={{
                  minWidth: 48,
                  paddingHorizontal: spacing.xs,
                  paddingVertical: spacing.xxs,
                  borderRadius: radius.full,
                  alignItems: 'center',
                  backgroundColor: solido ?? c.surfaceMuted,
                }}
              >
                <ThemedText
                  variant="caption"
                  numberOfLines={1}
                  style={{ color: solido ? statusColors.onStatus : c.textSecondary }}
                >
                  {decimal(h.precipitacaoMm)} mm
                </ThemedText>
              </View>
              <ThemedText variant="caption" tone="textSecondary" numberOfLines={1}>
                {h.probabilidadePrecipitacao ?? 0}%
              </ThemedText>
              {naJanela ? (
                <ThemedText variant="caption" tone="tint" numberOfLines={1}>
                  Janela
                </ThemedText>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </Cartao>
  );
}
