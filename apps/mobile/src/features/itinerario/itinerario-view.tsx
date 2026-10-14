// Itinerário de uma linha de trilho no trajeto (detalhe opcional, pedido de 14/10/2026): sentido
// inferido da origem/destino com "Trocar sentido", linha vertical na cor da linha com um marcador
// por estação, embarque e desembarque em destaque e o trecho entre eles realçado (o resto
// esmaecido). Situação da linha = último briefing em cache (nenhuma requisição nesta tela).
// Movimento: a lista entra com fade curto e a tela rola até o embarque; com movimento reduzido,
// sem entrada e rolagem sem animação.
import type { BriefingResponse, RailLine, RailSituation } from '@kairos/contracts';
import { useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ScrollView, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Botao } from '@/components/botao';
import { Entrada } from '@/components/entrada';
import { LineBadge } from '@/components/line-badge';
import { LinhaInformativa } from '@/components/linha-informativa';
import { ThemedText } from '@/components/themed-text';
import { detalheDaLinha, fonteDaLinha } from '@/features/briefing/explicar-fonte';
import { haQuantoTempo, SITUACAO_TRILHO } from '@/features/briefing/format';
import { formatarDistancia } from '@/features/map/distancias';
import type { TrajetoSalvo } from '@/features/trajetos/storage';
import { LINHAS_TRILHO_LOCAL, operadoraLinhaTrilho } from '@/features/trajetos/linhas-trilho';
import {
  lineColorFallback,
  lineColors,
  maxContentWidth,
  radius,
  shadows,
  spacing,
  useColors,
  type Tom,
} from '@/theme';

import type { DadosLinha } from './estacoes-da-linha';
import {
  LEGENDA_PAPEL,
  LONGE_DA_LINHA_M,
  montarItinerario,
  papelDaEstacao,
  rotuloEstacao,
  type Itinerario,
} from './montar-itinerario';
import { avisoDaLinha } from './aviso-da-linha';
import { situacaoDaLinha } from './situacao-da-linha';

const TOM_SITUACAO: Record<RailSituation, Tom> = {
  NORMAL: 'ok',
  ALTERADA: 'atencao',
  PARALISADA: 'erro',
  DESCONHECIDA: 'neutro',
};

// Geometria do traçado (local a este desenho, como as medidas da LineBadge).
const COLUNA = 32;
const TRACO = 6;
const MARCADOR = 16;
const MARCADOR_DESTAQUE = 22;
const ALTURA_PARADA = 60;
/** Trecho fora do embarque–desembarque: traço e marcadores esmaecidos. */
const ESMAECIDO = 0.35;

type Props = {
  linha: RailLine;
  trajeto: TrajetoSalvo;
  dados: DadosLinha;
  /** Último briefing em cache do trajeto (sem requisição); undefined se ainda não houve. */
  briefing: BriefingResponse | undefined;
  agora: number;
};

const dataBR = (iso: string) => iso.split('-').reverse().join('/');

export function ItinerarioView({ linha, trajeto, dados, briefing, agora }: Props) {
  const c = useColors();
  const reduzido = useReducedMotion();
  const [trocado, setTrocado] = useState(false);
  const { origem, destino } = trajeto.trajeto;
  const it = useMemo(
    () => montarItinerario(dados.estacoes, origem, destino, trocado),
    [dados.estacoes, origem, destino, trocado]
  );
  const cor = lineColors[linha] ?? lineColorFallback;
  const nomeCor = LINHAS_TRILHO_LOCAL.find((l) => l.linha === linha)?.nome ?? null;
  const operadora = operadoraLinhaTrilho(linha);

  // Rolagem até o embarque: posição da lista no conteúdo + posição da linha do embarque.
  const rolagem = useRef<ScrollView>(null);
  const listaY = useRef<number | null>(null);
  const embarqueY = useRef<number | null>(null);
  const rolarAteEmbarque = () => {
    if (listaY.current === null || embarqueY.current === null) return;
    const y = listaY.current + embarqueY.current - ALTURA_PARADA * 1.5;
    if (y > 0) rolagem.current?.scrollTo({ y, animated: !reduzido });
  };

  const trocarSentido = () => {
    const proximo = montarItinerario(dados.estacoes, origem, destino, !trocado);
    setTrocado((t) => !t);
    AccessibilityInfo.announceForAccessibility?.(`Sentido ${proximo.terminal}`);
  };

  const situacao = situacaoDaLinha(briefing, linha);
  const aviso = avisoDaLinha(linha);
  const temProjeto = dados.estacoes.some((e) => e.coordenadaDeProjeto);
  const chaveSentido = it.estacoes[0]?.nome ?? '';

  return (
    <SafeAreaView
      edges={['bottom', 'left', 'right']}
      style={{ flex: 1, backgroundColor: c.background }}
    >
      <ScrollView
        ref={rolagem}
        contentContainerStyle={{
          width: '100%',
          maxWidth: maxContentWidth,
          alignSelf: 'center',
          gap: spacing.xl,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.lg,
          paddingBottom: spacing.xxl,
        }}
      >
        {/* Linha e sentido (como o topo dos apps de transporte) */}
        <View style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <LineBadge tipo="trilho" linha={linha} />
            <ThemedText variant="headline" style={{ flex: 1 }}>
              {[nomeCor, operadora].filter(Boolean).join(' · ')}
            </ThemedText>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: spacing.md,
              flexWrap: 'wrap',
            }}
          >
            <View style={{ flex: 1, minWidth: 180, gap: spacing.xxs }}>
              <ThemedText variant="overline" tone="textSecondary">
                Sentido
              </ThemedText>
              <ThemedText variant="title" accessibilityRole="header" testID="itinerario-sentido">
                {it.terminal}
              </ThemedText>
            </View>
            <Botao
              titulo="Trocar sentido"
              variante="texto"
              onPress={trocarSentido}
              accessibilityHint="Mostra as estações no sentido contrário"
              testID="itinerario-trocar-sentido"
            />
          </View>
          <ResumoDoTrecho it={it} />
        </View>

        {/* Situação atual (último briefing; nunca inventada) */}
        <View style={{ gap: spacing.sm }}>
          <ThemedText
            variant="overline"
            tone="textSecondary"
            style={{ paddingHorizontal: spacing.xs }}
          >
            Situação da linha
          </ThemedText>
          <View
            style={{
              backgroundColor: c.surface,
              borderRadius: radius.lg,
              borderCurve: 'continuous',
              boxShadow: shadows.card,
            }}
          >
            {situacao ? (
              <LinhaInformativa
                icone="metro"
                tom={TOM_SITUACAO[situacao.situacao]}
                rotuloTom={SITUACAO_TRILHO[situacao.situacao]}
                titulo={situacao.statusTexto}
                texto={[
                  detalheDaLinha(situacao),
                  [
                    fonteDaLinha(situacao),
                    situacao.observadoEm
                      ? `atualizado ${haQuantoTempo(situacao.observadoEm, agora)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                ]
                  .filter(Boolean)
                  .join(' ')}
                testID="itinerario-situacao"
              />
            ) : (
              <LinhaInformativa
                icone="metro"
                tom="neutro"
                titulo="Situação ainda não consultada"
                texto={
                  trajeto.trajeto.trilhos.includes(linha)
                    ? 'Abra o briefing do trajeto para consultar a situação desta linha.'
                    : 'Esta linha não está no trajeto; o briefing não consulta a situação dela.'
                }
                testID="itinerario-situacao"
              />
            )}
            {aviso ? (
              <LinhaInformativa
                icone="atencao"
                tom="atencao"
                rotuloTom="Atenção"
                titulo={aviso.titulo}
                texto={aviso.texto}
                testID="itinerario-aviso"
              />
            ) : null}
          </View>
        </View>

        {/* Estações */}
        <View
          onLayout={(e) => {
            listaY.current = e.nativeEvent.layout.y;
            rolarAteEmbarque();
          }}
          style={{ gap: spacing.sm }}
        >
          <ThemedText
            variant="overline"
            tone="textSecondary"
            style={{ paddingHorizontal: spacing.xs }}
          >
            {`${it.estacoes.length} estações`}
          </ThemedText>
          <Entrada
            key={chaveSentido}
            style={{
              backgroundColor: c.surface,
              borderRadius: radius.lg,
              borderCurve: 'continuous',
              boxShadow: shadows.card,
              paddingVertical: spacing.sm,
            }}
          >
            {it.estacoes.map((e, i) => (
              <View
                key={`${chaveSentido}:${e.nome}`}
                onLayout={
                  i === it.embarque
                    ? (ev) => {
                        embarqueY.current = ev.nativeEvent.layout.y;
                        rolarAteEmbarque();
                      }
                    : undefined
                }
              >
                <Parada it={it} i={i} corLinha={cor.bg} />
              </View>
            ))}
          </Entrada>
          <ThemedText
            variant="caption"
            tone="textSecondary"
            style={{ paddingHorizontal: spacing.xs }}
          >
            {`Estações: ${dados.fonteOrdem.nome}, consultado em ${dataBR(dados.fonteOrdem.consultadoEm)}. ` +
              `Localização: GeoSampa, consultado em ${dataBR(dados.fonteCoordenadas.consultadoEm)}` +
              (temProjeto ? ' (algumas estações pela localização de projeto da linha).' : '.')}
          </ThemedText>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** "N estações de X a Y" ou, sem trecho, o porquê (nunca força um embarque longe da linha). */
function ResumoDoTrecho({ it }: { it: Itinerario }) {
  const avisos: string[] = [];
  if (it.semCoordenadas) {
    avisos.push(
      'Sem a localização das estações desta linha: não dá para marcar embarque e desembarque.'
    );
  } else {
    const longe = formatarDistancia(LONGE_DA_LINHA_M);
    if (it.embarque === null && it.origemAteLinhaM !== null)
      avisos.push(
        `A origem fica a ${formatarDistancia(it.origemAteLinhaM)} da estação mais próxima desta linha ` +
          `(mais de ${longe}): o embarque não foi marcado.`
      );
    if (it.desembarque === null && it.destinoAteLinhaM !== null)
      avisos.push(
        `O destino fica a ${formatarDistancia(it.destinoAteLinhaM)} da estação mais próxima desta linha ` +
          `(mais de ${longe}): o desembarque não foi marcado.`
      );
    if (it.embarque !== null && it.embarque === it.desembarque)
      avisos.push(
        `Origem e destino ficam mais perto da mesma estação (${it.estacoes[it.embarque].nome}): ` +
          'esta linha talvez não seja necessária neste trajeto.'
      );
  }
  if (avisos.length) {
    return (
      <ThemedText variant="subhead" tone="textSecondary" testID="itinerario-resumo">
        {avisos.join(' ')}
      </ThemedText>
    );
  }
  if (it.paradas === null || it.embarque === null || it.desembarque === null) return null;
  return (
    <ThemedText variant="body" testID="itinerario-resumo">
      <ThemedText variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>
        {it.paradas === 1 ? '1 estação' : `${it.paradas} estações`}
      </ThemedText>
      {` de ${it.estacoes[it.embarque].nome} a ${it.estacoes[it.desembarque].nome}`}
    </ThemedText>
  );
}

function Parada({ it, i, corLinha }: { it: Itinerario; i: number; corLinha: string }) {
  const c = useColors();
  const e = it.estacoes[i];
  const papel = papelDaEstacao(it, i);
  const temTrecho =
    it.embarque !== null && it.desembarque !== null && it.embarque !== it.desembarque;
  const realce = (j: number) => !temTrecho || papelDaEstacao(it, j) !== 'fora';
  const destaque = papel === 'embarque' || papel === 'desembarque';
  const primeira = i === 0;
  const ultima = i === it.estacoes.length - 1;
  const tamanho = destaque ? MARCADOR_DESTAQUE : MARCADOR;
  const meia = (de: number, ate: number) => (realce(de) && realce(ate) ? 1 : ESMAECIDO);

  return (
    <View
      accessible
      accessibilityLabel={rotuloEstacao(it, i)}
      testID={`itinerario-estacao-${i}`}
      style={{ flexDirection: 'row', minHeight: ALTURA_PARADA, paddingHorizontal: spacing.lg }}
    >
      <View style={{ width: COLUNA, alignItems: 'center', justifyContent: 'center' }}>
        {/* Metade de cima e de baixo do traço: o trecho entre embarque e desembarque fica cheio. */}
        {!primeira ? (
          <View
            style={{
              position: 'absolute',
              top: 0,
              bottom: '50%',
              width: TRACO,
              backgroundColor: corLinha,
              opacity: meia(i - 1, i),
            }}
          />
        ) : null}
        {!ultima ? (
          <View
            style={{
              position: 'absolute',
              top: '50%',
              bottom: 0,
              width: TRACO,
              backgroundColor: corLinha,
              opacity: meia(i, i + 1),
            }}
          />
        ) : null}
        <View
          style={{
            width: tamanho,
            height: tamanho,
            borderRadius: radius.full,
            borderWidth: destaque ? 4 : 3,
            borderColor: destaque ? c.surface : corLinha,
            backgroundColor: destaque ? corLinha : c.surface,
            opacity: realce(i) ? 1 : ESMAECIDO,
            boxShadow: destaque ? `0 0 0 2px ${corLinha}` : undefined,
          }}
        />
      </View>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          paddingVertical: spacing.sm,
          paddingLeft: spacing.md,
        }}
      >
        <ThemedText
          variant={destaque ? 'headlineStrong' : realce(i) ? 'bodyStrong' : 'body'}
          tone={realce(i) ? 'text' : 'textSecondary'}
        >
          {e.nome}
        </ThemedText>
        {destaque ? (
          <ThemedText variant="subhead" tone="tint">
            {LEGENDA_PAPEL[papel]}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}
