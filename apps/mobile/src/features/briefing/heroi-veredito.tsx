// Herói do briefing (tela inicial e briefing): responde O QUE fazer, QUANDO e POR QUÊ.
//   Sair agora? → veredito (palavra grande) → ação com horário → porquê em uma linha →
//   sinais (pílulas ícone + dado) → confiança, recência e tendência no rodapé.
// Ordem de leitura de tela: veredito → ação → horário/porquê → motivos → confiança/recência.
// Troca de veredito: o fundo transiciona a cor e o conteúdo entra com fade (200 ms); pulso só no
// ícone quando é AGUARDAR. Com movimento reduzido, nada anima.
import type { BriefingResponse } from '@kairos/contracts';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { ENTRADA_DETALHE } from '@/components/entrada';
import { Esqueleto } from '@/components/esqueleto';
import { Icon } from '@/components/icon';
import { PulsoCritico } from '@/components/pulso-critico';
import { ThemedText } from '@/components/themed-text';
import { tendenciaChuva, TENDENCIA } from '@/features/tempo/tendencia';
import { alvoMinimo, contornoSobreStatus, motion, radius, spacing, statusColors } from '@/theme';

import { atualizadoAs, CONFIANCA, VEREDITO } from './format';
import { observacao } from './observacao';
import { acaoPrincipal } from './recomendacoes';
import { sinaisDoBriefing, type Sinal } from './sinais-do-briefing';

const BRANCO = { color: statusColors.onStatus };
const MAX_SINAIS = 3;

type Props = {
  briefing: BriefingResponse;
  agora: number;
  /** Nome do trajeto no topo (tela inicial). */
  trajeto?: string;
  /** Linha de estado da atualização ("Atualizando…", "Desatualizado"). */
  estado?: string | null;
  /** Tela inicial: o herói abre o briefing completo. */
  onPress?: () => void;
  /** Mostra "Consultar de novo" quando o veredito é Indeterminado ou a confiança é baixa. */
  onAtualizar?: () => void;
  atualizando?: boolean;
};

export function HeroiVeredito({
  briefing,
  agora,
  trajeto,
  estado,
  onPress,
  onAtualizar,
  atualizando,
}: Props) {
  const reduzido = useReducedMotion();
  const v = VEREDITO[briefing.veredito];
  const acao = acaoPrincipal(briefing, agora);
  const sinais = sinaisDoBriefing(briefing, agora).slice(0, MAX_SINAIS);
  const clima = observacao(briefing, 'weather')?.value;
  const tendencia = clima ? tendenciaChuva(clima.horas) : null;
  // Confiança abaixo de alta sempre vem com o porquê (ex.: "Clima e ar indisponíveis").
  const explicacao =
    briefing.confianca.nivel !== 'ALTA' && briefing.confianca.explicacao.trim()
      ? // A causa técnica entre parênteses ("Prazo do briefing esgotado…") fica em "Atrasos e obstáculos".
        ` (${briefing.confianca.explicacao.trim().replace(/\.$/, '').replace(/\s*\(.*\)$/, '')})`
      : '';
  const rodape = `Confiança ${CONFIANCA[briefing.confianca.nivel].toLowerCase()}${explicacao} · ${atualizadoAs(briefing.geradoEm, agora)}`;
  // Sem dados para decidir ou confiança baixa: a próxima ação útil é consultar de novo.
  const pedeAtualizar =
    !!onAtualizar && (briefing.veredito === 'INDETERMINADO' || briefing.confianca.nivel === 'BAIXA');

  const rotulo = [
    trajeto ? `${trajeto}.` : null,
    `Veredito: ${v.rotulo}.`,
    `${acao.titulo}.`,
    acao.detalhe ? `${acao.detalhe}.` : null,
    sinais.length > 0 ? `Sinais: ${sinais.map((s) => s.texto).join('; ')}.` : null,
    `${rodape}.`,
    tendencia ? `${TENDENCIA[tendencia].rotulo}.` : null,
    estado ? `${estado}.` : null,
  ]
    .filter(Boolean)
    .join(' ');

  // Corpo do herói: um item só para o leitor de tela (rótulo na ordem veredito → ação → motivos).
  const corpo = (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <ThemedText variant="overline" style={[BRANCO, { flex: 1 }]} numberOfLines={1}>
          {trajeto ? `Sair agora? · ${trajeto}` : 'Sair agora?'}
        </ThemedText>
        {onPress ? <Icon name="chevron" size={20} color={statusColors.onStatus} /> : null}
      </View>

      <View style={{ gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <PulsoCritico ativo={briefing.veredito === 'AGUARDAR'}>
            <Icon name={v.icone} size={48} color={statusColors.onStatus} />
          </PulsoCritico>
          <ThemedText variant="display" style={[BRANCO, { flex: 1 }]} numberOfLines={1} adjustsFontSizeToFit>
            {v.rotulo}
          </ThemedText>
        </View>
        <ThemedText variant="title" style={BRANCO}>
          {acao.titulo}
        </ThemedText>
        {acao.detalhe ? (
          <ThemedText variant="bodyStrong" style={BRANCO}>
            {acao.detalhe}
          </ThemedText>
        ) : null}
      </View>

      {sinais.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {sinais.map((s) => (
            <Pilula key={s.dimensao} sinal={s} />
          ))}
        </View>
      ) : null}

      <View
        style={{
          gap: spacing.xxs,
          paddingTop: spacing.md,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: contornoSobreStatus,
        }}
      >
        <ThemedText variant="subheadStrong" style={BRANCO}>
          {rodape}
        </ThemedText>
        {tendencia ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Icon name={TENDENCIA[tendencia].icone} size={16} color={statusColors.onStatus} />
            <ThemedText variant="subhead" style={BRANCO}>
              {TENDENCIA[tendencia].rotulo}
            </ThemedText>
          </View>
        ) : null}
        {estado ? (
          <ThemedText variant="subhead" style={BRANCO} accessibilityLiveRegion="polite">
            {estado}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );

  return (
    <Animated.View
      testID="heroi-veredito"
      style={{
        backgroundColor: v.cor,
        borderRadius: radius.lg,
        borderCurve: 'continuous',
        overflow: 'hidden',
        transitionProperty: reduzido ? undefined : 'backgroundColor',
        transitionDuration: motion.base,
      }}
    >
      {/* key: quando o veredito muda, o conteúdo novo entra com fade em vez de saltar. */}
      <Animated.View key={briefing.veredito} entering={reduzido ? undefined : ENTRADA_DETALHE}>
        {onPress ? (
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={rotulo}
            accessibilityHint="Abre o briefing completo do trajeto"
            style={({ pressed }) => ({
              padding: spacing.lg,
              backgroundColor: pressed ? 'rgba(0, 0, 0, 0.12)' : 'transparent',
            })}
          >
            {corpo}
          </Pressable>
        ) : (
          <View accessible accessibilityRole="header" accessibilityLabel={rotulo} style={{ padding: spacing.lg }}>
            {corpo}
          </View>
        )}
        {pedeAtualizar ? (
          <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
            <Pressable
              onPress={onAtualizar}
              disabled={atualizando}
              accessibilityRole="button"
              accessibilityLabel={atualizando ? 'Consultando as fontes de novo' : 'Consultar as fontes de novo'}
              accessibilityState={{ busy: !!atualizando, disabled: !!atualizando }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing.sm,
                minHeight: alvoMinimo,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: statusColors.onStatus,
                backgroundColor: pressed ? 'rgba(0, 0, 0, 0.12)' : 'transparent',
                opacity: atualizando ? 0.7 : 1,
              })}
            >
              <Icon name="atualizar" size={20} color={statusColors.onStatus} />
              <ThemedText variant="bodyStrong" style={BRANCO}>
                {atualizando ? 'Consultando…' : 'Consultar de novo'}
              </ThemedText>
            </Pressable>
          </View>
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}

/** Pílula sobre a faixa do veredito: ícone + dado, texto branco, contorno claro. */
function Pilula({ sinal }: { sinal: Sinal }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        minHeight: 32,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: contornoSobreStatus,
      }}
    >
      <Icon name={sinal.icone} size={16} color={statusColors.onStatus} />
      <ThemedText variant="subheadStrong" style={BRANCO} numberOfLines={1}>
        {sinal.texto}
      </ThemedText>
    </View>
  );
}

/** Esqueleto com a forma do herói, enquanto o primeiro briefing chega (sem spinner). */
export function HeroiEsqueleto({ trajeto, texto }: { trajeto?: string; texto: string }) {
  return (
    <View
      testID="heroi-esqueleto"
      accessible
      accessibilityLabel={texto}
      style={{
        backgroundColor: statusColors.indeterminado,
        borderRadius: radius.lg,
        borderCurve: 'continuous',
        padding: spacing.lg,
        gap: spacing.md,
      }}
    >
      <ThemedText variant="overline" style={BRANCO} numberOfLines={1}>
        {trajeto ? `Sair agora? · ${trajeto}` : 'Sair agora?'}
      </ThemedText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Esqueleto largura={48} altura={48} redondo sobreCor />
        <Esqueleto largura={180} altura={40} sobreCor />
      </View>
      <Esqueleto largura="70%" altura={22} sobreCor />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Esqueleto largura={112} altura={32} redondo sobreCor />
        <Esqueleto largura={96} altura={32} redondo sobreCor />
      </View>
      <ThemedText variant="subhead" style={BRANCO}>
        {texto}
      </ThemedText>
    </View>
  );
}
