// Topo da tela inicial: o briefing do trajeto principal em todos os estados, precedido do
// motivo do destaque ("Fixado por você" + Automático, ou "Sugerido agora: …").
//   com dado  → aviso (offline/erro, se houver) + herói + melhor horário
//   sem dado  → esqueleto do herói (consultando) · erro com a causa · offline sem salvo
import type { BriefingResponse } from '@kairos/contracts';
import type { UseQueryResult } from '@tanstack/react-query';
import { View } from 'react-native';

import { Botao } from '@/components/botao';
import { EstadoTela } from '@/components/estado-tela';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { AvisoDesatualizado, motivoDesatualizado } from '@/features/briefing/aviso-desatualizado';
import { HeroiEsqueleto, HeroiVeredito } from '@/features/briefing/heroi-veredito';
import { MelhorHorario } from '@/features/briefing/melhor-horario';
import { useAtualizarBriefing } from '@/features/briefing/use-atualizar-briefing';
import { mensagemDeErro } from '@/shared/api/errors';
import { useNavegacao } from '@/shared/navegacao/use-navegacao';
import { ACOES, ESTADOS } from '@/shared/textos';
import { spacing, useColors } from '@/theme';

import type { MotivoDestaque } from './ordenar-trajetos';
import type { TrajetoSalvo } from './storage';

type Props = {
  trajeto: TrajetoSalvo;
  briefing: UseQueryResult<BriefingResponse, Error>;
  agora: number;
  /** Por que este trajeto está no topo (fixado × sugerido pela hierarquia). */
  destaque?: MotivoDestaque;
  /** Desfaz a fixação (só aparece quando o motivo é "fixado"). */
  onAutomatico?: () => void;
};

/** Linha curta acima do herói: deixa claro se o topo foi escolha da pessoa ou palpite. */
export function MotivoDoDestaque({
  destaque,
  onAutomatico,
}: {
  destaque: MotivoDestaque;
  onAutomatico?: () => void;
}) {
  const c = useColors();
  const fixado = destaque.tipo === 'fixado';
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xs }}
    >
      <Icon name={fixado ? 'principal' : destaque.tipo === 'habito' ? 'relogio' : 'rota'} size={16} color={c.tint} />
      <ThemedText variant="caption" tone="textSecondary" style={{ flex: 1 }}>
        {destaque.texto}
      </ThemedText>
      {fixado && onAutomatico ? (
        <Botao
          titulo="Automático"
          variante="texto"
          tamanho="sm"
          accessibilityLabel="Automático: deixar de fixar; o topo passa a seguir seus favoritos e horários"
          onPress={onAutomatico}
        />
      ) : null}
    </View>
  );
}

export function PainelPrincipal({ trajeto, briefing, agora, destaque, onAutomatico }: Props) {
  const conteudo = <ConteudoPainel trajeto={trajeto} briefing={briefing} agora={agora} />;
  if (!destaque) return conteudo;
  return (
    <View style={{ gap: spacing.sm }}>
      <MotivoDoDestaque destaque={destaque} onAutomatico={onAutomatico} />
      {conteudo}
    </View>
  );
}

function ConteudoPainel({ trajeto, briefing, agora }: Props) {
  const { data, error, fetchStatus, isFetching, refetch } = briefing;
  const atualizar = useAtualizarBriefing(refetch);
  const motivo = motivoDesatualizado(error, fetchStatus);
  const nav = useNavegacao();
  const abrir = () => nav.empurrar({ pathname: '/trajetos/[id]/briefing', params: { id: trajeto.id } });

  if (!data) {
    if (error) {
      const e = ESTADOS.erroBriefing(trajeto.nome, mensagemDeErro(error));
      return (
        <EstadoTela
          tipo="erro"
          titulo={e.titulo}
          texto={e.texto}
          acao={{ rotulo: ACOES.tentarDeNovo, onPress: atualizar, carregando: isFetching, icone: 'atualizar' }}
        />
      );
    }
    if (fetchStatus === 'paused') {
      const e = ESTADOS.semConexaoSemBriefing(trajeto.nome);
      return <EstadoTela tipo="offline" titulo={e.titulo} texto={e.texto} />;
    }
    return <HeroiEsqueleto trajeto={trajeto.nome} texto={ESTADOS.consultandoFontes} />;
  }

  return (
    <View style={{ gap: spacing.md }}>
      {motivo ? (
        <AvisoDesatualizado
          geradoEm={data.geradoEm}
          agora={agora}
          motivo={motivo}
          offline={fetchStatus === 'paused'}
          onAtualizar={fetchStatus === 'paused' ? undefined : atualizar}
          atualizando={isFetching}
        />
      ) : null}
      <HeroiVeredito
        briefing={data}
        agora={agora}
        trajeto={trajeto.nome}
        estado={isFetching ? 'Atualizando agora…' : null}
        onPress={abrir}
        onAtualizar={atualizar}
        atualizando={isFetching}
      />
      <MelhorHorario briefing={data} agora={agora} />
    </View>
  );
}
