// RF05, RF11–RF14, RF07, RNF07, RNF11: apresentação de um briefing já validado pelo contrato.
// Ordem = ordem da decisão:
//   herói (veredito → ação com horário → porquê → sinais → confiança/recência)
//   → melhor horário (se não for Favorável) → O que fazer agora (+ atalhos Uber/99 se Aguardar)
//   → Atrasos e obstáculos
//   → uma seção por dimensão (número grande + como pesou no veredito + detalhes ao tocar)
//   → fontes e atribuições.
// Sempre visíveis: atribuições (RNF11), o rótulo "estimativa de modelo" do ar (RF07), a
// recência/estado de cada dimensão (RF12) e o aviso Desatualizado (RF17).
import type { BriefingResponse, Dimension, Observation, RailLine, RailSituation } from '@kairos/contracts';
import type { Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { Botao } from '@/components/botao';
import { Revelar } from '@/components/entrada';
import { Icon, type IconName } from '@/components/icon';
import { LineBadge } from '@/components/line-badge';
import { ListRow } from '@/components/list-row';
import { ListSection } from '@/components/list-section';
import { Secao } from '@/components/secao';
import { StatusDot } from '@/components/status-dot';
import { ThemedText } from '@/components/themed-text';
import { AtalhosCorrida } from '@/features/atalhos/atalhos-corrida';
import { formatarDistancia } from '@/features/map/distancias';
import { ProximasHoras } from '@/features/tempo/proximas-horas';
import { nomeLinhaTrilho } from '@/features/trajetos/linhas-trilho';
import type { TrajetoSalvo } from '@/features/trajetos/storage';
import { useNavegacao } from '@/shared/navegacao/use-navegacao';
import { ACOES } from '@/shared/textos';
import { coresDoTom, spacing, useColors, type Tom } from '@/theme';

import { efeitoDaDimensao } from './efeito-dimensao';
import { detalheDaLinha, fonteDaLinha, nomeDaFonte } from './explicar-fonte';
import { decimal, FAIXA_AR, horaSP, SITUACAO_TRILHO } from './format';
import { FreshnessBadge } from './freshness-badge';
import { HeroiVeredito } from './heroi-veredito';
import { alagamentoMaisProximo, chegadas, emMinutos, noPonto, picoDeChuva } from './leituras';
import { ListaObstaculos } from './lista-obstaculos';
import { ListaRecomendacoes } from './lista-recomendacoes';
import { MelhorHorario, mostraMelhorHorario } from './melhor-horario';
import { recomendacoes } from './recomendacoes';
import { atrasoMin, MAGNITUDE_TRECHO, NIVEL_TRANSITO, temposDoTransito, textoAtraso } from './transito';

type Props = {
  briefing: BriefingResponse;
  agora: number;
  /** Aviso acima do herói (ex.: "Desatualizado · sem conexão"). */
  aviso?: ReactNode;
  /** Linha de estado no rodapé do herói ("Atualizando…"). */
  estado?: string | null;
  /** Só na tela de exemplos (dev): abre todas as seções para revisão visual. */
  expandidoInicial?: boolean;
  /** Trajeto salvo: liga os atalhos Uber/99 (veredito Aguardar) e o "Ver itinerário" das linhas. */
  trajeto?: TrajetoSalvo;
};

/** Ordem das seções de dados: o que muda a cada minuto primeiro. */
const ORDEM: Dimension[] = ['bus', 'rail', 'traffic', 'weather', 'air', 'flood'];

const TITULO_SECAO: Record<Dimension, string> = {
  bus: 'Ônibus',
  rail: 'Metrô e trem',
  weather: 'Chuva e tempo',
  air: 'Qualidade do ar',
  flood: 'Alagamento',
  traffic: 'Trânsito',
};

/** Como o traçado do briefing foi calculado (contrato 1.5.0). Linha reta não é rota: não se apresenta como tal. */
export const TEXTO_GEOMETRIA: Record<BriefingResponse['geometria']['fonte'], string> = {
  tomtom: 'rota pelas ruas com trânsito (© TomTom)',
  osrm: 'rota pelas ruas (OSRM)',
  'linha-reta': 'sem rota pelas ruas neste briefing',
};

const ICONE_TOM: Record<Tom, IconName> = {
  ok: 'favoravel',
  atencao: 'atencao',
  erro: 'aguardar',
  neutro: 'info',
};

const TOM_TRILHO: Record<RailSituation, Tom> = {
  NORMAL: 'ok',
  ALTERADA: 'atencao',
  PARALISADA: 'erro',
  DESCONHECIDA: 'neutro',
};

const TOM_FAIXA_AR = { BOA: 'ok', MODERADA: 'neutro', RUIM: 'atencao', MUITO_RUIM: 'erro', PESSIMA: 'erro' } as const;

export function BriefingView({ briefing, agora, aviso, estado, expandidoInicial = false, trajeto }: Props) {
  const observacoes = [...briefing.observacoes].sort(
    (a, b) => ORDEM.indexOf(a.dimension) - ORDEM.indexOf(b.dimension)
  );

  return (
    <View style={{ gap: spacing.xl }}>
      <View style={{ gap: spacing.md }}>
        {aviso}
        <HeroiVeredito briefing={briefing} agora={agora} estado={estado} />
        <MelhorHorario briefing={briefing} agora={agora} />
      </View>

      <Secao titulo="O que fazer agora">
        <ListaRecomendacoes itens={recomendacoes(briefing, agora)} />
        {/* Decisão de 14/10/2026: atalhos de corrida SÓ quando o veredito é Aguardar. */}
        {trajeto && briefing.veredito === 'AGUARDAR' ? (
          <AtalhosCorrida origem={trajeto.trajeto.origem} destino={trajeto.trajeto.destino} />
        ) : null}
      </Secao>

      <Secao titulo="Atrasos e obstáculos">
        <ListaObstaculos briefing={briefing} agora={agora} />
      </Secao>

      {observacoes.length === 0 ? (
        <Secao titulo="Dados do trajeto">
          <ListSection>
            <ListRow>
              <ThemedText variant="subhead" tone="textSecondary" style={{ flex: 1 }}>
                O servidor não enviou nenhuma observação neste briefing. Atualize para consultar as
                fontes de novo.
              </ThemedText>
            </ListRow>
          </ListSection>
        </Secao>
      ) : (
        observacoes.map((o) => (
          <SecaoObservacao
            key={o.dimension}
            obs={o}
            briefing={briefing}
            agora={agora}
            expandidoInicial={expandidoInicial}
            trajetoId={trajeto?.id}
          />
        ))
      )}

      {/* RNF11: atribuições SEMPRE visíveis, fora de qualquer expansão. */}
      <View style={{ gap: spacing.xs, paddingHorizontal: spacing.xs }}>
        <ThemedText variant="overline" tone="textSecondary" accessibilityRole="header">
          Fontes e atribuições
        </ThemedText>
        <ThemedText variant="caption" tone="textSecondary" selectable>
          {briefing.atribuicoes.length > 0
            ? briefing.atribuicoes.join(' · ')
            : 'Nenhuma fonte respondeu neste briefing.'}
        </ThemedText>
        <ThemedText variant="caption" tone="textSecondary">
          Briefing gerado às {horaSP(briefing.geradoEm)} · {TEXTO_GEOMETRIA[briefing.geometria.fonte]}
        </ThemedText>
      </View>
    </View>
  );
}

/** Linha "Ver detalhes" / "Ocultar detalhes" das seções expansíveis. */
function LinhaExpandir({ aberto, onPress }: { aberto: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <ListRow
      onPress={onPress}
      accessibilityLabel={aberto ? ACOES.ocultarDetalhes : ACOES.verDetalhes}
      accessibilityState={{ expanded: aberto }}
    >
      <ThemedText variant="subheadStrong" tone="tint" style={{ flex: 1 }}>
        {aberto ? ACOES.ocultarDetalhes : ACOES.verDetalhes}
      </ThemedText>
      <Icon name={aberto ? 'recolher' : 'expandir'} size={16} color={c.tint} />
    </ListRow>
  );
}

/** Como a dimensão pesou no veredito: ícone e cor do tom + frase. */
function LinhaEfeito({ tom, texto }: { tom: Tom; texto: string }) {
  const c = useColors();
  return (
    <ListRow style={{ alignItems: 'flex-start' }}>
      <Icon name={ICONE_TOM[tom]} size={20} color={coresDoTom(c, tom).fg} />
      <ThemedText variant="subhead" style={{ flex: 1 }}>
        {texto}
      </ThemedText>
    </ListRow>
  );
}

function SecaoObservacao({
  obs,
  briefing,
  agora,
  expandidoInicial = false,
  trajetoId,
}: {
  obs: Observation;
  briefing: BriefingResponse;
  agora: number;
  expandidoInicial?: boolean;
  trajetoId?: string;
}) {
  const c = useColors();
  const nav = useNavegacao();
  const [aberto, setAberto] = useState(expandidoInicial);
  // Tela do itinerário é da outra frente (app/trajetos/[id]/itinerario/[linha].tsx).
  // shortcut: `as Href` porque a rota tipada ainda não existe nesta árvore; tirar quando a tela entrar.
  const verItinerario = trajetoId
    ? (linha: RailLine) => nav.empurrar(`/trajetos/${trajetoId}/itinerario/${linha}` as Href)
    : undefined;
  const { compacto, detalhes, extra } = linhasObservacao(obs, agora, briefing, c.tint, verItinerario);
  const efeito = efeitoDaDimensao(obs, briefing);

  return (
    <Secao
      titulo={TITULO_SECAO[obs.dimension]}
      comLayout
      // RF12: recência/estado de cada dimensão sempre visível.
      acessorio={<FreshnessBadge status={obs.status} observedAt={obs.observedAt} agora={agora} />}
      rodape={aberto ? `Fonte: ${nomeDaFonte(obs.source)}` : undefined}
    >
      <ListSection>
        {obs.dimension === 'air' && obs.value ? (
          // RF07 / B.8: SEMPRE visível, mesmo compacto — o ar é estimativa do modelo CAMS.
          <ListRow>
            <Icon name="info" size={20} color={c.tint} />
            <ThemedText variant="subheadStrong" tone="tint" style={{ flex: 1 }}>
              Estimativa de modelo (CAMS), não é medição de estação
            </ThemedText>
          </ListRow>
        ) : null}
        {compacto}
        <LinhaEfeito tom={efeito.tom} texto={efeito.texto} />
        {aberto ? detalhes.map((d, i) => <Revelar key={i}>{d}</Revelar>) : null}
        {detalhes.length > 0 ? (
          <LinhaExpandir aberto={aberto} onPress={() => setAberto((v) => !v)} />
        ) : null}
      </ListSection>
      {extra}
    </Secao>
  );
}

/** Número grande + rótulo curto (compacto) e detalhes (ao tocar), por dimensão. */
function linhasObservacao(
  obs: Observation,
  agora: number,
  briefing: BriefingResponse,
  tint: string,
  verItinerario?: (linha: RailLine) => void
): { compacto: ReactNode[]; detalhes: ReactNode[]; extra?: ReactNode } {
  if (obs.value === null) return { compacto: [], detalhes: [] };
  switch (obs.dimension) {
    case 'bus': {
      const b = obs.value;
      const lista = chegadas(b, agora);
      const melhor = lista.find((l) => l.minutos !== null && l.minutos >= 0);
      const ponto = noPonto(b);
      const compacto = [
        <ListRow
          key="resumo"
          accessibilityLabel={
            melhor
              ? `Próximo ônibus: ${melhor.letreiro} ${emMinutos(melhor.minutos!)}, às ${horaSP(melhor.horario!)}, ${ponto}`
              : `Nenhuma linha com previsão de chegada ${ponto}`
          }
        >
          {melhor ? (
            <>
              <ThemedText variant="metricLg" tone="tint">
                {melhor.minutos}
                <ThemedText variant="metric" tone="tint">
                  {' '}
                  min
                </ThemedText>
              </ThemedText>
              <View style={{ flex: 1, gap: spacing.xxs, alignItems: 'flex-start' }}>
                <LineBadge tipo="onibus" letreiro={melhor.letreiro} tamanho="sm" />
                <ThemedText variant="caption" tone="textSecondary">
                  chega às {horaSP(melhor.horario!)} {ponto}
                </ThemedText>
              </View>
            </>
          ) : (
            <ThemedText variant="bodyStrong" tone="textSecondary" style={{ flex: 1 }}>
              Nenhuma linha com previsão {ponto}
            </ThemedText>
          )}
        </ListRow>,
      ];
      const detalhes = lista.map((l) => (
        <ListRow
          key={l.codigoLinha}
          accessibilityLabel={
            l.minutos === null
              ? `${l.letreiro}: sem previsão, ${l.veiculos} veículos transmitindo`
              : `${l.letreiro}: chega às ${horaSP(l.horario!)}, ${l.veiculos} veículos transmitindo`
          }
        >
          <LineBadge tipo="onibus" letreiro={l.letreiro} />
          <ThemedText variant="caption" tone="textSecondary" style={{ flex: 1 }}>
            {l.veiculos} {l.veiculos === 1 ? 'veículo transmitindo' : 'veículos transmitindo'}
          </ThemedText>
          {l.minutos === null ? (
            <ThemedText variant="subhead" tone="textSecondary">
              sem previsão
            </ThemedText>
          ) : (
            <View style={{ alignItems: 'flex-end' }}>
              <ThemedText variant="metric" tone="tint">
                {horaSP(l.horario!)}
              </ThemedText>
              <ThemedText variant="caption" tone="textSecondary">
                {l.minutos < 0 ? 'já passou' : emMinutos(l.minutos)}
              </ThemedText>
            </View>
          )}
        </ListRow>
      ));
      return { compacto, detalhes };
    }
    case 'rail': {
      const linhas = obs.value.linhas;
      const pior =
        linhas.find((l) => l.situacao === 'PARALISADA') ??
        linhas.find((l) => l.situacao === 'ALTERADA') ??
        linhas.find((l) => l.situacao === 'DESCONHECIDA') ??
        linhas[0];
      const compacto = [
        <ListRow
          key="resumo"
          accessibilityLabel={`Situação do metrô e trem: ${pior ? `${SITUACAO_TRILHO[pior.situacao]} na ${nomeLinhaTrilho(pior.linha)}` : 'sem linhas'}`}
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, flex: 1 }}>
            {linhas.map((l) => (
              <LineBadge key={l.linha} tipo="trilho" linha={l.linha} />
            ))}
          </View>
          {pior ? <StatusDot tom={TOM_TRILHO[pior.situacao]} texto={SITUACAO_TRILHO[pior.situacao]} /> : null}
        </ListRow>,
      ];
      const detalhes = linhas.map((l) => (
        <ListRow key={l.linha} style={{ alignItems: 'flex-start' }}>
          <LineBadge tipo="trilho" linha={l.linha} />
          <View style={{ flex: 1, gap: spacing.xxs }}>
            <ThemedText variant="bodyStrong">{nomeLinhaTrilho(l.linha)}</ThemedText>
            <ThemedText variant="subhead" tone="textSecondary" selectable>
              “{l.statusTexto}”
            </ThemedText>
            {detalheDaLinha(l) ? (
              <ThemedText variant="subhead" selectable>
                {detalheDaLinha(l)}
              </ThemedText>
            ) : null}
            <ThemedText variant="caption" tone="textSecondary">
              Fonte: {fonteDaLinha(l)}
            </ThemedText>
            {verItinerario ? (
              <Botao
                titulo="Ver itinerário"
                variante="texto"
                tamanho="sm"
                accessibilityLabel={`Ver itinerário da ${nomeLinhaTrilho(l.linha)}`}
                onPress={() => {
                  verItinerario(l.linha);
                }}
              />
            ) : null}
          </View>
          <StatusDot tom={TOM_TRILHO[l.situacao]} texto={SITUACAO_TRILHO[l.situacao]} />
        </ListRow>
      ));
      return { compacto, detalhes };
    }
    case 'weather': {
      const { atual, horas, sol } = obs.value;
      const p = picoDeChuva(obs.value, agora);
      const quando = p.hora ? `às ${horaSP(p.hora)}` : 'agora';
      const compacto = [
        <ListRow
          key="resumo"
          accessibilityLabel={`Maior chuva prevista nas próximas 2 horas: ${decimal(p.mm)} milímetros por hora, ${quando}. ${decimal(atual.temperaturaC)} graus agora.`}
        >
          <ThemedText variant="metricLg" tone="tint">
            {decimal(p.mm)}
            <ThemedText variant="metric" tone="tint">
              {' '}
              mm/h
            </ThemedText>
          </ThemedText>
          <View style={{ flex: 1, gap: spacing.xxs }}>
            <ThemedText variant="subheadStrong">maior chuva nas próximas 2 h ({quando})</ThemedText>
            <ThemedText variant="caption" tone="textSecondary">
              {decimal(atual.temperaturaC)} °C agora
              {p.probabilidade != null ? ` · ${p.probabilidade}% de chance` : ''}
            </ThemedText>
          </View>
        </ListRow>,
      ];
      const detalhes = [
        <ListRow key="agora">
          <ThemedText variant="body" style={{ flex: 1 }}>
            Agora: {decimal(atual.temperaturaC)} °C · chuva {decimal(atual.precipitacaoMm)} mm/h
            {atual.ventoKmH !== null ? ` · vento ${decimal(atual.ventoKmH, 0)} km/h` : ''}
          </ThemedText>
        </ListRow>,
        ...(sol
          ? [
              <ListRow key="sol">
                <ThemedText variant="subhead" tone="textSecondary" style={{ flex: 1 }}>
                  Sol nasce às {horaSP(sol.nascer)} e se põe às {horaSP(sol.por)}
                </ThemedText>
              </ListRow>,
            ]
          : []),
      ];
      const extra =
        horas.length > 0 ? (
          <View style={{ gap: spacing.xs }}>
            <ThemedText variant="subheadStrong" tone="textSecondary" style={{ paddingHorizontal: spacing.xs }}>
              Próximas horas na origem do trajeto
            </ThemedText>
            <ProximasHoras horas={horas} agora={agora} janela={mostraMelhorHorario(briefing) ? briefing.janelaMeteorologica : undefined}
            />
          </View>
        ) : undefined;
      return { compacto, detalhes, extra };
    }
    case 'air': {
      const a = obs.value;
      const compacto = [
        <ListRow
          key="resumo"
          accessibilityLabel={`Qualidade do ar: ${a.faixa ? FAIXA_AR[a.faixa] : 'sem faixa'}${
            a.pm25Media24h !== null ? `, MP2,5 média de 24 horas ${decimal(a.pm25Media24h)} microgramas por metro cúbico` : ''
          }`}
        >
          <ThemedText variant="metricLg" tone="tint">
            {a.pm25Media24h !== null ? decimal(a.pm25Media24h, 0) : decimal(a.pm25, 0)}
            <ThemedText variant="metric" tone="tint">
              {' '}
              µg/m³
            </ThemedText>
          </ThemedText>
          <View style={{ flex: 1, gap: spacing.xxs }}>
            {a.faixa ? (
              <StatusDot tom={TOM_FAIXA_AR[a.faixa]} texto={`Faixa ${FAIXA_AR[a.faixa]}`} />
            ) : (
              <ThemedText variant="subheadStrong" tone="textSecondary">
                Sem faixa (faltam 24 h de dados)
              </ThemedText>
            )}
            <ThemedText variant="caption" tone="textSecondary">
              {a.pm25Media24h !== null ? 'MP2,5 · média de 24 h' : 'MP2,5 · valor da hora'}
            </ThemedText>
          </View>
        </ListRow>,
      ];
      const detalhes = [
        <ListRow key="hora">
          <ThemedText variant="body" style={{ flex: 1 }}>
            MP2,5 na hora: {decimal(a.pm25)} µg/m³
          </ThemedText>
          <ThemedText variant="caption" tone="textSecondary">
            índice {a.indice} ({a.escalaIndice === 'US_AQI' ? 'US AQI' : 'European AQI'})
          </ThemedText>
        </ListRow>,
      ];
      return { compacto, detalhes };
    }
    case 'flood': {
      const f = obs.value;
      const d = alagamentoMaisProximo(f);
      const compacto = [
        <ListRow
          key="pontos"
          accessibilityLabel={
            d === null
              ? `Nenhum ponto histórico de alagamento a até ${f.raioM} metros do trajeto`
              : `${f.pontos.length} pontos históricos de alagamento a até ${f.raioM} metros; o mais próximo a ${d} metros`
          }
        >
          <ThemedText variant="metricLg" tone="tint">
            {d === null ? '0' : `${d}`}
            <ThemedText variant="metric" tone="tint">
              {d === null ? ' pontos' : ' m'}
            </ThemedText>
          </ThemedText>
          <ThemedText variant="subheadStrong" style={{ flex: 1 }}>
            {d === null
              ? `nenhum ponto histórico a até ${f.raioM} m`
              : `até o ponto histórico mais próximo (${f.pontos.length} a até ${f.raioM} m)`}
          </ThemedText>
        </ListRow>,
      ];
      const detalhes = f.pontos.map((p) => (
        <ListRow key={p.sourceId}>
          <Icon name="alagamento" size={20} color={tint} />
          <ThemedText variant="subhead" style={{ flex: 1 }}>
            {Math.round(p.distanciaM)} m{p.local ? ` · ${p.local}` : ''}
            {p.ocorridoEm ? ` · ocorrido em ${p.ocorridoEm.split('-').reverse().join('/')}` : ''}
          </ThemedText>
        </ListRow>
      ));
      return { compacto, detalhes };
    }
    case 'traffic': {
      const t = obs.value;
      const nivel = NIVEL_TRANSITO[t.nivel];
      const compacto = [
        // ListRow sem onPress não repassa accessibilityLabel: o rótulo fica numa View acessível.
        <ListRow key="resumo">
          <View
            accessible
            accessibilityLabel={`Trânsito ${nivel.rotulo.toLowerCase()}, ${textoAtraso(t)}: ${temposDoTransito(t)}, ${formatarDistancia(t.distanciaM)} de carro ou ônibus`}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
          >
            <ThemedText variant="metricLg" tone="tint">
              {atrasoMin(t) === 0 ? '0' : `+${atrasoMin(t)}`}
              <ThemedText variant="metric" tone="tint">
                {' '}
                min
              </ThemedText>
            </ThemedText>
            <View style={{ flex: 1, gap: spacing.xxs, alignItems: 'flex-start' }}>
              <StatusDot tom={nivel.tom} texto={`Trânsito ${nivel.rotulo.toLowerCase()}`} />
              <ThemedText variant="caption" tone="textSecondary">
                {temposDoTransito(t)} · {formatarDistancia(t.distanciaM)}
              </ThemedText>
            </View>
          </View>
        </ListRow>,
      ];
      const detalhes = t.trechosLentos.map((x, i) => (
        <ListRow key={i}>
          <Icon name="rota" size={20} color={tint} />
          <ThemedText variant="subhead" style={{ flex: 1 }}>
            Trecho de {formatarDistancia(x.comprimentoM)}: {MAGNITUDE_TRECHO[x.magnitude]}
          </ThemedText>
          <ThemedText variant="subheadStrong" tone="tint">
            {textoAtraso(x)}
          </ThemedText>
        </ListRow>
      ));
      // Atribuição exigida pela TomTom, sempre visível quando o dado vem dela.
      const extra = obs.source.replace(/^simulado:/, '') === 'tomtom' ? (
        <ThemedText variant="caption" tone="textSecondary" style={{ paddingHorizontal: spacing.xs }}>
          © TomTom
        </ThemedText>
      ) : undefined;
      return { compacto, detalhes, extra };
    }
  }
}
