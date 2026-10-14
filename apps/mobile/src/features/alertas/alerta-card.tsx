// Cartão orientativo compacto e expansível: resumo de 1 linha sempre visível,
// detalhes e fonte só ao tocar (divulgação progressiva, com transição de altura).
// Destaque segue o NÍVEL REAL do alerta calculado do mesmo tema (defeito de 13/10: um aviso
// informativo ganhava borda de alerta). Sem alerta do tema, o cartão fica neutro.
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { Revelar, TRANSICAO_LAYOUT } from '@/components/entrada';
import { Icon } from '@/components/icon';
import { PulsoCritico } from '@/components/pulso-critico';
import { ThemedText } from '@/components/themed-text';
import { coresDoTom, radius, shadows, spacing, useColors } from '@/theme';

import type { AlertaConteudo } from './alertas-conteudo';
import { NIVEL, type NivelAlerta } from './avaliar-alertas';

type Props = {
  alerta: AlertaConteudo;
  /** Nível do alerta calculado do mesmo tema agora (undefined = nada ativo no tema). */
  nivel?: NivelAlerta;
};

export function AlertaCard({ alerta, nivel }: Props) {
  const c = useColors();
  const reduzido = useReducedMotion();
  const [aberto, setAberto] = useState(false);
  const n = nivel !== undefined ? NIVEL[nivel] : null;
  const cor = n ? coresDoTom(c, n.tom).fg : c.textSecondary;

  return (
    <Animated.View layout={reduzido ? undefined : TRANSICAO_LAYOUT}>
      <PulsoCritico ativo={nivel === 3}>
        <Pressable
          onPress={() => setAberto((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={`${alerta.titulo}${n ? `, no seu trajeto agora: ${n.rotulo}` : ''}. ${alerta.resumo}`}
          accessibilityHint={aberto ? 'Toque para recolher' : 'Toque para ver detalhes e a fonte'}
          accessibilityState={{ expanded: aberto }}
          style={({ pressed }) => ({
            backgroundColor: pressed ? c.surfacePressed : c.surface,
            borderRadius: radius.lg,
            borderCurve: 'continuous',
            boxShadow: shadows.card,
            borderLeftWidth: n ? 4 : 0,
            borderLeftColor: cor,
            padding: spacing.lg,
            gap: spacing.xs,
          })}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <ThemedText variant="overline" style={{ color: cor, flex: 1 }}>
              {alerta.tema}
              {n ? ` · ${n.rotulo} no seu trajeto` : ''}
            </ThemedText>
            <Icon name={aberto ? 'recolher' : 'expandir'} size={16} color={c.textSecondary} />
          </View>
          <ThemedText variant="headlineStrong">{alerta.titulo}</ThemedText>
          <ThemedText variant="subhead" tone="textSecondary">
            {alerta.resumo}
          </ThemedText>
          {aberto ? (
            <Revelar style={{ gap: spacing.sm }}>
              {alerta.detalhes.map((p, i) => (
                <ThemedText key={i} variant="subhead" selectable>
                  {p}
                </ThemedText>
              ))}
              <ThemedText variant="caption" tone="textSecondary" selectable>
                Fonte: {alerta.fonte}
              </ThemedText>
            </Revelar>
          ) : null}
        </Pressable>
      </PulsoCritico>
    </Animated.View>
  );
}
