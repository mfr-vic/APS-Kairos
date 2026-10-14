// RF26: vereditos por dia em barras empilhadas feitas com Views (sem biblioteca de gráfico).
// A cor nunca vem sozinha: legenda com o nome de cada veredito e, logo abaixo, a mesma informação
// em tabela de texto (é ela que o leitor de tela lê; o desenho fica oculto para ele).
import { View } from 'react-native';

import { ListRow } from '@/components/list-row';
import { ListSection } from '@/components/list-section';
import { ThemedText } from '@/components/themed-text';
import { VEREDITO } from '@/features/briefing/format';
import { radius, spacing, useColors } from '@/theme';

import { diaCurto, ORDEM_VEREDITOS, resumoDoDia, totalDoDia, type DiaRelatorio } from './formatar-relatorio';

const ALTURA = 120;

export function GraficoVereditos({ dias }: { dias: DiaRelatorio[] }) {
  const c = useColors();
  const maximo = Math.max(1, ...dias.map(totalDoDia));
  const comBriefing = dias.filter((d) => totalDoDia(d) > 0);
  // Com 30 colunas não cabe rótulo em todas: só o primeiro e o último dia.
  const rotular = (i: number) => dias.length <= 7 || i === 0 || i === dias.length - 1;

  return (
    <View style={{ gap: spacing.md }}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ backgroundColor: c.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm }}
      >
        <View style={{ height: ALTURA, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xxs }}>
          {dias.map((d) => (
            <View
              key={d.dia}
              testID={`barra-${d.dia}`}
              style={{ flex: 1, height: (totalDoDia(d) / maximo) * ALTURA, justifyContent: 'flex-end', gap: 1 }}
            >
              {[...ORDEM_VEREDITOS].reverse().map((v) =>
                d[v] > 0 ? (
                  <View key={v} style={{ flex: d[v], backgroundColor: VEREDITO[v].cor, borderRadius: 2 }} />
                ) : null
              )}
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.xxs }}>
          {dias.map((d, i) => (
            <ThemedText
              key={d.dia}
              variant="caption"
              tone="textSecondary"
              numberOfLines={1}
              style={{ flex: 1, textAlign: dias.length <= 7 ? 'center' : i === 0 ? 'left' : 'right' }}
            >
              {rotular(i) ? diaCurto(d.dia) : ''}
            </ThemedText>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          {ORDEM_VEREDITOS.map((v) => (
            <View key={v} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: VEREDITO[v].cor }} />
              <ThemedText variant="caption">{VEREDITO[v].rotulo}</ThemedText>
            </View>
          ))}
        </View>
      </View>

      <ListSection titulo="Por dia" rodape="Dias sem briefing ficam fora da tabela.">
        {comBriefing.map((d) => (
          <ListRow key={d.dia} accessibilityLabel={resumoDoDia(d)}>
            <ThemedText variant="subheadStrong">{diaCurto(d.dia)}</ThemedText>
            <ThemedText variant="subhead" tone="textSecondary" style={{ flex: 1, textAlign: 'right' }}>
              {ORDEM_VEREDITOS.filter((v) => d[v] > 0)
                .map((v) => `${d[v]} ${VEREDITO[v].rotulo}`)
                .join(' · ')}
            </ThemedText>
          </ListRow>
        ))}
      </ListSection>
    </View>
  );
}
