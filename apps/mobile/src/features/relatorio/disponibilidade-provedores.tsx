// RF26: disponibilidade por provedor = (fresh + stale) / consultas no período (vem pronta da API),
// com barra linear e os números ao lado — a barra nunca é a única forma de ler o valor.
import type { ReportsSummaryResponse } from '@kairos/contracts';
import { View } from 'react-native';

import { ListRow } from '@/components/list-row';
import { ListSection } from '@/components/list-section';
import { ThemedText } from '@/components/themed-text';
import { nomeDaFonte } from '@/features/briefing/explicar-fonte';
import { coresDoTom, radius, spacing, useColors } from '@/theme';

import { porcentagem, tomDaDisponibilidade } from './formatar-relatorio';

type Provedor = ReportsSummaryResponse['disponibilidadePorProvedor'][number];

export function detalheProvedor(p: Provedor): string {
  return `${p.fresh} atual · ${p.stale} em cache · ${p.unavailable} indisponível, de ${p.consultas} consultas`;
}

export function DisponibilidadeProvedores({ provedores }: { provedores: Provedor[] }) {
  const c = useColors();
  return (
    <ListSection
      titulo="Disponibilidade por fonte"
      rodape="Disponível = respondeu com dado atual ou em cache dentro do prazo, entre as consultas feitas pelos briefings do período."
    >
      {provedores.map((p) => {
        const { fg } = coresDoTom(c, tomDaDisponibilidade(p.disponibilidadePct));
        const nome = nomeDaFonte(p.provedor);
        return (
          <ListRow
            key={p.provedor}
            accessibilityLabel={`${nome}: ${porcentagem(p.disponibilidadePct)} disponível. ${detalheProvedor(p)}`}
          >
            <View style={{ flex: 1, gap: spacing.xs }}>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <ThemedText variant="body" style={{ flex: 1 }}>
                  {nome}
                </ThemedText>
                <ThemedText variant="bodyStrong">{porcentagem(p.disponibilidadePct)}</ThemedText>
              </View>
              <View style={{ height: 8, borderRadius: radius.full, backgroundColor: c.surfaceMuted, overflow: 'hidden' }}>
                <View
                  testID={`disponibilidade-${p.provedor}`}
                  style={{ width: `${p.disponibilidadePct ?? 0}%`, height: '100%', backgroundColor: fg }}
                />
              </View>
              <ThemedText variant="caption" tone="textSecondary">
                {detalheProvedor(p)}
              </ThemedText>
            </View>
          </ListRow>
        );
      })}
    </ListSection>
  );
}
