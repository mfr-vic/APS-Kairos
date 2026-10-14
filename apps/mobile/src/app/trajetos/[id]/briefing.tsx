// F2 / F4: briefing de um trajeto, com o último resultado salvo quando a API não responde.
// Estados: lendo o trajeto (esqueleto) · trajeto excluído · consultando (esqueleto com texto) ·
// erro sem salvo (causa + Tentar de novo) · offline sem salvo · conteúdo (+ aviso Desatualizado).
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { Botao } from '@/components/botao';
import { EstadoTela } from '@/components/estado-tela';
import { StackScreen } from '@/components/stack-screen';
import { AvisoDesatualizado, motivoDesatualizado } from '@/features/briefing/aviso-desatualizado';
import { BriefingView } from '@/features/briefing/briefing-view';
import { useAgora } from '@/features/briefing/format';
import { HeroiEsqueleto } from '@/features/briefing/heroi-veredito';
import { BotaoCompartilhar } from '@/features/briefing/botao-compartilhar';
import { useAtualizarBriefing } from '@/features/briefing/use-atualizar-briefing';
import { useBriefing } from '@/features/briefing/use-briefing';
import { useRegistrarUso, useTrajeto } from '@/features/trajetos/use-trajetos';
import { mensagemDeErro } from '@/shared/api/errors';
import { ACOES, ESTADOS } from '@/shared/textos';
import { spacing } from '@/theme';

export default function BriefingRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trajeto = useTrajeto(id);
  const briefing = useBriefing(trajeto.data);
  const agora = useAgora();
  const atualizar = useAtualizarBriefing(briefing.refetch);

  // Abrir o briefing = um uso do trajeto (hierarquia da lista; fica só no aparelho).
  const existe = !!trajeto.data;
  const { mutate: registrarUso } = useRegistrarUso();
  useEffect(() => {
    if (existe && id) registrarUso(id);
  }, [existe, id, registrarUso]);

  const titulo = trajeto.data?.nome ?? 'Briefing';

  if (trajeto.isPending) {
    return (
      <StackScreen title={titulo}>
        <HeroiEsqueleto texto="Abrindo o trajeto salvo…" />
      </StackScreen>
    );
  }
  if (!trajeto.data) {
    return (
      <StackScreen title={titulo}>
        <EstadoTela
          tipo="vazio"
          titulo={ESTADOS.trajetoNaoEncontrado.titulo}
          texto={ESTADOS.trajetoNaoEncontrado.texto}
          acao={{ rotulo: ACOES.voltarAosTrajetos, onPress: () => router.back() }}
        />
      </StackScreen>
    );
  }

  const nome = trajeto.data.nome;
  const { data, error, isFetching, fetchStatus } = briefing;
  const motivo = motivoDesatualizado(error, fetchStatus);

  if (!data) {
    let corpo;
    if (error) {
      const e = ESTADOS.erroBriefing(nome, mensagemDeErro(error));
      corpo = (
        <EstadoTela
          tipo="erro"
          titulo={e.titulo}
          texto={e.texto}
          acao={{ rotulo: ACOES.tentarDeNovo, onPress: atualizar, carregando: isFetching, icone: 'atualizar' }}
        />
      );
    } else if (fetchStatus === 'paused') {
      const e = ESTADOS.semConexaoSemBriefing(nome);
      corpo = <EstadoTela tipo="offline" titulo={e.titulo} texto={e.texto} />;
    } else {
      corpo = <HeroiEsqueleto trajeto={nome} texto={ESTADOS.consultandoFontes} />;
    }
    return <StackScreen title={nome}>{corpo}</StackScreen>;
  }

  // RF17 / TC19 / TC20: falhou a atualização, mas há briefing anterior (memória ou persister).
  const aviso = motivo ? (
    <AvisoDesatualizado
      geradoEm={data.geradoEm}
      agora={agora}
      motivo={motivo}
      offline={fetchStatus === 'paused'}
      onAtualizar={fetchStatus === 'paused' ? undefined : atualizar}
      atualizando={isFetching}
    />
  ) : null;

  return (
    <StackScreen title={nome} onRefresh={() => briefing.refetch()}>
      <BriefingView
        briefing={data}
        trajeto={trajeto.data}
        agora={agora}
        aviso={aviso}
        estado={isFetching ? 'Atualizando agora…' : null}
      />
      <View style={{ gap: spacing.sm }}>
        <Botao
          titulo={isFetching ? 'Atualizando…' : ACOES.atualizarBriefing}
          icone="atualizar"
          variante="primario"
          carregando={isFetching}
          onPress={atualizar}
        />
        <BotaoCompartilhar nomeTrajeto={nome} briefing={data} />
      </View>
    </StackScreen>
  );
}
