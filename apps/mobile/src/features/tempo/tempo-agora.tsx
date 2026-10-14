// "Tempo agora": ícone grande + temperatura + condição e sensação + máx/mín, e uma grade 3×2
// (umidade, vento, UV com faixa, chance de chuva na próxima hora, nascer e pôr do sol).
// Cada célula = ícone + rótulo + valor numa linha só (o valor nunca quebra).
// Estados: esqueleto com a forma da grade; erro com a causa e "Tentar de novo"; desatualizado
// com a idade; sem conexão e sem dado salvo, diz isso.
import type React from 'react';
import { View } from 'react-native';

import { Cartao } from '@/components/cartao';
import { Esqueleto } from '@/components/esqueleto';
import { EstadoTela } from '@/components/estado-tela';
import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { explicarMotivo } from '@/features/briefing/explicar-fonte';
import { decimal, haQuantoTempo, horaSP } from '@/features/briefing/format';
import type { ObservacaoTempo } from '@/shared/api/client';
import { mensagemDeErro } from '@/shared/api/errors';
import { ACOES } from '@/shared/textos';
import { spacing, useColors } from '@/theme';

import { condicaoDoCodigo } from './codigo-tempo';
import { faixaUv } from './faixas';
import { useTempoAgora } from './use-tempo-agora';

type Props = { agora: number };

export function TempoAgora({ agora }: Props) {
  const consulta = useTempoAgora();
  const { data: obs, isPending, error, fetchStatus, refetch, isFetching } = consulta;

  if (obs === undefined) {
    if (error) {
      return (
        <EstadoTela
          variante="faixa"
          tipo="erro"
          titulo="Previsão do tempo indisponível"
          texto={mensagemDeErro(error)}
          acao={{ rotulo: ACOES.tentarDeNovo, onPress: () => refetch(), carregando: isFetching }}
        />
      );
    }
    if (fetchStatus === 'paused') {
      return (
        <EstadoTela
          variante="faixa"
          tipo="offline"
          titulo="Sem conexão: tempo agora indisponível"
          texto="A previsão aparece quando a internet voltar."
        />
      );
    }
    if (isPending) return <TempoAgoraEsqueleto />;
  }
  if (!obs) return <TempoAgoraEsqueleto />;

  if (obs.value === null) {
    return (
      <EstadoTela
        variante="faixa"
        tipo="erro"
        titulo="Previsão do tempo indisponível"
        texto={`${explicarMotivo(obs.source, obs.motivo)}.`}
        acao={{ rotulo: ACOES.tentarDeNovo, onPress: () => refetch(), carregando: isFetching }}
      />
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {error ? (
        <EstadoTela
          variante="faixa"
          tipo="desatualizado"
          titulo={`Previsão de ${obs.observedAt ? haQuantoTempo(obs.observedAt, agora) : 'horário desconhecido'}`}
          texto={`Não atualizou: ${mensagemDeErro(error)}`}
          acao={{ rotulo: ACOES.tentarDeNovo, onPress: () => refetch(), carregando: isFetching }}
        />
      ) : null}
      <CartaoTempo obs={obs} agora={agora} />
    </View>
  );
}

function CartaoTempo({ obs, agora }: { obs: ObservacaoTempo; agora: number }) {
  const c = useColors();
  const { atual, sol, hoje, horas } = obs.value!;
  const proxima = horas.find((h) => Date.parse(h.hora) > agora) ?? horas[0];
  const condicao = condicaoDoCodigo(atual.codigoTempo);
  const uv = atual.uv === null ? null : faixaUv(atual.uv);

  const linhaCondicao = [
    condicao?.descricao ?? 'Condição não informada',
    atual.sensacaoC !== null ? `sensação de ${decimal(atual.sensacaoC, 0)}°` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  type Cel = { icone: IconName; rotulo: string; valor: string; leitura: string };
  const brutas: (Cel | null)[] = [
    atual.umidadePct !== null
      ? { icone: 'umidade', rotulo: 'Umidade', valor: `${decimal(atual.umidadePct, 0)}%`, leitura: `umidade ${decimal(atual.umidadePct, 0)}%` }
      : null,
    atual.ventoKmH !== null
      ? { icone: 'vento', rotulo: 'Vento', valor: `${decimal(atual.ventoKmH, 0)} km/h`, leitura: `vento ${decimal(atual.ventoKmH, 0)} km/h` }
      : null,
    uv && atual.uv !== null
      ? { icone: 'uv', rotulo: 'UV', valor: `${decimal(atual.uv, 0)} · ${uv.rotulo}`, leitura: `UV ${decimal(atual.uv, 0)}, ${uv.rotulo}` }
      : null,
    proxima?.probabilidadePrecipitacao != null
      ? {
          icone: 'guardaChuva',
          rotulo: `Chuva às ${horaSP(proxima.hora).slice(0, 2)}h`,
          valor: `${proxima.probabilidadePrecipitacao}%`,
          leitura: `${proxima.probabilidadePrecipitacao}% de chance de chuva às ${horaSP(proxima.hora)}`,
        }
      : null,
    sol ? { icone: 'nascerSol', rotulo: 'Nascer do sol', valor: horaSP(sol.nascer), leitura: `sol nasce às ${horaSP(sol.nascer)}` } : null,
    sol ? { icone: 'porSol', rotulo: 'Pôr do sol', valor: horaSP(sol.por), leitura: `sol se põe às ${horaSP(sol.por)}` } : null,
  ];
  const celulas = brutas.filter((x): x is Cel => x !== null);

  const rotulo = [
    `Tempo agora: ${decimal(atual.temperaturaC)} graus`,
    linhaCondicao,
    hoje ? `máxima ${decimal(hoje.temperaturaMaxC, 0)}, mínima ${decimal(hoje.temperaturaMinC, 0)}` : null,
    ...celulas.map((x) => x.leitura),
    obs.status !== 'fresh' && obs.observedAt ? `dado de ${haQuantoTempo(obs.observedAt, agora)}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Cartao accessibilityLabel={rotulo} testID="tempo-agora">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Icon name={condicao?.icone ?? 'termometro'} size={48} color={c.tint} />
        <View style={{ flex: 1 }}>
          <ThemedText variant="metricLg">{decimal(atual.temperaturaC)}°C</ThemedText>
          <ThemedText variant="subhead" tone="textSecondary">
            {linhaCondicao}
          </ThemedText>
        </View>
        {hoje ? (
          <View style={{ alignItems: 'flex-end', gap: spacing.xxs }}>
            <ThemedText variant="subheadStrong">↑ {decimal(hoje.temperaturaMaxC, 0)}°</ThemedText>
            <ThemedText variant="subheadStrong" tone="textSecondary">
              ↓ {decimal(hoje.temperaturaMinC, 0)}°
            </ThemedText>
          </View>
        ) : null}
      </View>

      {celulas.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.lg }}>
          {celulas.map((cel) => (
            <Celula key={cel.rotulo} icone={cel.icone} rotulo={cel.rotulo}>
              {cel.valor}
            </Celula>
          ))}
        </View>
      ) : null}

      {obs.status !== 'fresh' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Icon name="desatualizado" size={16} color={c.fgAtencao} />
          <ThemedText variant="caption" tone="textSecondary">
            Previsão de {obs.observedAt ? haQuantoTempo(obs.observedAt, agora) : 'horário desconhecido'}: a
            Open-Meteo não atualizou a tempo.
          </ThemedText>
        </View>
      ) : null}
    </Cartao>
  );
}

function Celula({ icone, rotulo, children }: { icone: IconName; rotulo: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={{ width: '33.33%', alignItems: 'center', gap: spacing.xxs, paddingHorizontal: spacing.xxs }}>
      <Icon name={icone} size={20} color={c.textSecondary} />
      <ThemedText variant="caption" tone="textSecondary" numberOfLines={1}>
        {rotulo}
      </ThemedText>
      <ThemedText variant="subheadStrong" numberOfLines={1} adjustsFontSizeToFit>
        {children}
      </ThemedText>
    </View>
  );
}

function TempoAgoraEsqueleto() {
  return (
    <Cartao accessibilityLabel="Consultando o tempo agora na Open-Meteo" testID="tempo-agora-esqueleto">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Esqueleto largura={48} altura={48} redondo />
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Esqueleto largura={120} altura={36} />
          <Esqueleto largura="60%" altura={14} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.lg }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={{ width: '33.33%', alignItems: 'center', gap: spacing.xs }}>
            <Esqueleto largura={20} altura={20} redondo />
            <Esqueleto largura={56} altura={12} />
            <Esqueleto largura={40} altura={14} />
          </View>
        ))}
      </View>
    </Cartao>
  );
}
