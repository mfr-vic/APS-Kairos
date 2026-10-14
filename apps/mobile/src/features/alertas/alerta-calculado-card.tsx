// Cartão de alerta calculado: bloco do ícone no tom do nível, selo (texto do nível), título,
// resumo com os números reais e o conselho. Mesma escala de cores do veredito; nunca só a cor.
import { View } from 'react-native';

import { Cartao } from '@/components/cartao';
import { IconeEmBloco } from '@/components/icone-em-bloco';
import { PulsoCritico } from '@/components/pulso-critico';
import { ThemedText } from '@/components/themed-text';
import { coresDoTom, spacing, useColors } from '@/theme';

import { NIVEL, type AlertaCalculado } from './avaliar-alertas';

export function AlertaCalculadoCard({ alerta }: { alerta: AlertaCalculado }) {
  const c = useColors();
  const n = NIVEL[alerta.nivel];
  return (
    <Cartao
      accessibilityLabel={`${n.rotulo}: ${alerta.titulo}. ${alerta.resumo.replace(/\.$/, '')}. ${alerta.conselho}`}
      style={{ flexDirection: 'row', alignItems: 'flex-start' }}
    >
      <PulsoCritico ativo={alerta.nivel === 3}>
        <IconeEmBloco icone={n.icone} tom={n.tom} />
      </PulsoCritico>
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <ThemedText variant="overline" style={{ color: coresDoTom(c, n.tom).fg }}>
          {n.rotulo}
        </ThemedText>
        <ThemedText variant="headlineStrong">{alerta.titulo}</ThemedText>
        <ThemedText variant="bodyStrong" selectable>
          {alerta.resumo}
        </ThemedText>
        <ThemedText variant="subhead" tone="textSecondary">
          {alerta.conselho}
        </ThemedText>
      </View>
    </Cartao>
  );
}
