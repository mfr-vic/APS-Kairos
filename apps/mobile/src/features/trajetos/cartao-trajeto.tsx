// Linha rica de trajeto na tela inicial: nome + selos (Favorito, Principal), origem → destino,
// linhas vinculadas com nome acessível, último veredito + o sinal mais importante (ex.: próxima
// chegada do ônibus) + recência. Toque abre o briefing. À direita, dois alvos de 48 px
// empilhados: a estrela (favoritar/desfavoritar, com Desfazer) e "Mais ações" (também no toque
// longo), que abre a folha com Ver briefing · Favoritar · Tornar principal · Editar · Excluir.
import { Pressable, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { ENTRADA_DETALHE, TRANSICAO_LAYOUT } from '@/components/entrada';
import { Icon } from '@/components/icon';
import { LineBadge } from '@/components/line-badge';
import { ListRow } from '@/components/list-row';
import { ThemedText } from '@/components/themed-text';
import { haQuantoTempo, VEREDITO } from '@/features/briefing/format';
import { sinaisDoBriefing } from '@/features/briefing/sinais-do-briefing';
import { useUltimoBriefing } from '@/features/briefing/use-briefing';
import { VerdictBadge } from '@/features/briefing/verdict-badge';
import { feedbackTatil } from '@/shared/feedback-tatil';
import { useNavegacao } from '@/shared/navegacao/use-navegacao';
import { alvoMinimo, fonts, motion, radius, spacing, useColors } from '@/theme';

import { nomeLinhaTrilho } from './linhas-trilho';
import type { TrajetoSalvo } from './storage';
import { TEXTOS_FAVORITO } from './use-acoes-trajeto';

type Props = {
  trajeto: TrajetoSalvo;
  agora: number;
  /** É o trajeto do herói da tela inicial (fixado ou o primeiro da hierarquia). */
  principal: boolean;
  /** Toque na estrela. Sem ele, a estrela não aparece (ex.: listas só de leitura). */
  onAlternarFavorito?: (t: TrajetoSalvo) => void;
  /** Anima a entrada (o cartão chegou depois da 1ª pintura: mudou de seção ou é novo). */
  animarEntrada?: boolean;
};


/** Resumo da situação do trajeto a partir do último briefing salvo (texto curto). */
export function situacaoDoTrajeto(
  ultimo: ReturnType<typeof useUltimoBriefing>,
  agora: number
): string {
  if (!ultimo) return 'Sem briefing ainda: toque para consultar';
  const sinais = sinaisDoBriefing(ultimo, agora);
  // O sinal mais grave e, se houver, a chegada do ônibus (dado que muda a decisão a cada minuto).
  const principal = sinais[0];
  const onibus = sinais.find((s) => s.dimensao === 'bus');
  const partes = [principal?.texto, onibus && onibus !== principal ? onibus.texto : null];
  return [...partes, `gerado ${haQuantoTempo(ultimo.geradoEm, agora)}`].filter(Boolean).join(' · ');
}

/** Selo pequeno com texto (nunca só cor ou só ícone). */
function Selo({ texto, icone, destaque }: { texto: string; icone?: 'principal'; destaque: boolean }) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xxs,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderRadius: radius.full,
        backgroundColor: destaque ? c.accent : c.surfaceMuted,
      }}
    >
      {icone ? <Icon name={icone} size={16} color={destaque ? c.onAccent : c.text} /> : null}
      <ThemedText
        variant="caption"
        style={{ color: destaque ? c.onAccent : c.text, fontFamily: fonts.bold }}
      >
        {texto}
      </ThemedText>
    </View>
  );
}

/**
 * Estrela de favorito: alvo de 48 px; marcada = estrela cheia sobre o fundo de decisão (o fundo
 * diferencia mesmo onde o Material desenha as duas estrelas parecidas); vazia = contorno.
 */
export function BotaoFavorito({
  nome,
  favorito,
  onPress,
}: {
  nome: string;
  favorito: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  const reduzido = useReducedMotion();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        favorito ? `${TEXTOS_FAVORITO.desfavoritar}: ${nome}` : `${TEXTOS_FAVORITO.favoritar}: ${nome}`
      }
      accessibilityState={{ selected: favorito }}
      accessibilityHint={favorito ? 'Tira da seção Favoritos' : 'Coloca no topo da lista, em Favoritos'}
      onPress={onPress}
      style={{ width: alvoMinimo, height: alvoMinimo, alignItems: 'center', justifyContent: 'center' }}
    >
      {({ pressed }) => (
        <Animated.View
          style={{
            width: 36,
            height: 36,
            borderRadius: radius.full,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: favorito ? c.accent : pressed ? c.surfacePressed : 'transparent',
            transform: [{ scale: pressed && !reduzido ? 0.9 : 1 }],
            transitionProperty: reduzido ? undefined : ['transform', 'backgroundColor'],
            transitionDuration: motion.fast,
          }}
        >
          <Icon
            name={favorito ? 'principal' : 'principalVazio'}
            size={24}
            color={favorito ? c.onAccent : c.textSecondary}
          />
        </Animated.View>
      )}
    </Pressable>
  );
}

export function CartaoTrajeto({
  trajeto: t,
  agora,
  principal,
  onAlternarFavorito,
  animarEntrada = false,
}: Props) {
  const c = useColors();
  const reduzido = useReducedMotion();
  const ultimo = useUltimoBriefing(t);
  const { origem, destino, trilhos, onibus } = t.trajeto;
  const favorito = t.favorito === true;
  const situacao = situacaoDoTrajeto(ultimo, agora);
  const linhas = [
    ...onibus.map((l) => `ônibus ${l.letreiro}`),
    ...trilhos.map((l) => nomeLinhaTrilho(l)),
  ];

  // useNavegacao (item 8): toques repetidos abrem UMA tela, não uma pilha delas.
  const nav = useNavegacao();
  const acoes = () => {
    if (nav.empurrar({ pathname: '/trajetos/[id]/acoes', params: { id: t.id } })) feedbackTatil.selecao();
  };

  return (
    <Animated.View
      entering={animarEntrada && !reduzido ? ENTRADA_DETALHE : undefined}
      layout={reduzido ? undefined : TRANSICAO_LAYOUT}
      style={{ flexDirection: 'row', alignItems: 'stretch' }}
      testID={`trajeto-${t.id}`}
    >
      <ListRow
        accessibilityLabel={[
          `${t.nome}${favorito ? ', favorito' : ''}${principal ? ', trajeto principal' : ''}`,
          `de ${origem.rotulo} a ${destino.rotulo}`,
          linhas.length ? `linhas: ${linhas.join(', ')}` : null,
          ultimo ? `último veredito: ${VEREDITO[ultimo.veredito].rotulo}` : null,
          situacao,
        ]
          .filter(Boolean)
          .join('. ')}
        accessibilityHint="Abre o briefing. Toque e segure para mais ações"
        onPress={() => nav.empurrar({ pathname: '/trajetos/[id]/briefing', params: { id: t.id } })}
        onLongPress={acoes}
        style={{ flex: 1, alignItems: 'flex-start', paddingRight: spacing.xs }}
      >
        <View style={{ flex: 1, gap: spacing.xs }}>
          <ThemedText variant="headlineStrong" numberOfLines={1}>
            {t.nome}
          </ThemedText>
          {favorito || principal ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {favorito ? <Selo texto={TEXTOS_FAVORITO.selo} icone="principal" destaque /> : null}
              {principal ? <Selo texto="Principal" destaque={false} /> : null}
            </View>
          ) : null}
          <ThemedText variant="subhead" tone="textSecondary" numberOfLines={1}>
            {origem.rotulo} → {destino.rotulo}
          </ThemedText>
          {linhas.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {onibus.map((l) => (
                <LineBadge key={l.codigoLinha} tipo="onibus" letreiro={l.letreiro} tamanho="sm" />
              ))}
              {trilhos.map((l) => (
                // Bolinha + nome da linha visível ("4 Amarela"): a cor sozinha não identifica.
                <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xxs }}>
                  <LineBadge tipo="trilho" linha={l} tamanho="sm" />
                  <ThemedText variant="caption" tone="textSecondary">
                    {nomeLinhaTrilho(l).replace(/^Linha \d+-/, '')}
                  </ThemedText>
                </View>
              ))}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}>
            {ultimo ? <VerdictBadge veredito={ultimo.veredito} /> : null}
            <ThemedText variant="caption" tone="textSecondary" style={{ flexShrink: 1 }}>
              {situacao}
            </ThemedText>
          </View>
        </View>
      </ListRow>
      <View style={{ width: alvoMinimo }}>
        {onAlternarFavorito ? (
          <BotaoFavorito nome={t.nome} favorito={favorito} onPress={() => onAlternarFavorito(t)} />
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Mais ações: ${t.nome}`}
          accessibilityHint="Ver briefing, favoritar, tornar principal, editar ou excluir"
          onPress={acoes}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: alvoMinimo,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? c.surfacePressed : 'transparent',
          })}
        >
          <Icon name="opcoes" size={24} color={c.tint} />
        </Pressable>
      </View>
    </Animated.View>
  );
}
