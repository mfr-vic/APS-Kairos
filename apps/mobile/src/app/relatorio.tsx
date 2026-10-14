// Relatório do sistema (RF26, parte do app): agregados de GET /v1/reports/summary nos últimos 7
// ou 30 dias — briefings, vereditos por dia, disponibilidade por fonte e latência do servidor.
// O servidor guarda só o hash do trajeto (RNF14): aqui não há nome nem endereço de ninguém.
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { Esqueleto } from '@/components/esqueleto';
import { EstadoTela } from '@/components/estado-tela';
import { ListRow } from '@/components/list-row';
import { ListSection } from '@/components/list-section';
import { StackScreen } from '@/components/stack-screen';
import { ThemedText } from '@/components/themed-text';
import { DisponibilidadeProvedores } from '@/features/relatorio/disponibilidade-provedores';
import { GraficoVereditos } from '@/features/relatorio/grafico-vereditos';
import { SeletorPeriodo } from '@/features/relatorio/seletor-periodo';
import { mensagemDeErro } from '@/shared/api/errors';
import { buscarRelatorio, chaveRelatorio, type PeriodoRelatorio } from '@/shared/api/relatorio';
import { ACOES } from '@/shared/textos';
import { spacing } from '@/theme';

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <ListRow accessibilityLabel={`${rotulo}: ${valor}`}>
      <ThemedText variant="body" style={{ flex: 1 }}>
        {rotulo}
      </ThemedText>
      <ThemedText variant="bodyStrong" selectable>
        {valor}
      </ThemedText>
    </ListRow>
  );
}

export default function RelatorioScreen() {
  const [dias, setDias] = useState<PeriodoRelatorio>(7);
  const q = useQuery({
    queryKey: chaveRelatorio(dias),
    queryFn: ({ signal }) => buscarRelatorio(dias, signal),
  });
  const r = q.data;

  return (
    <StackScreen title="Relatório do sistema" onRefresh={() => q.refetch()}>
      <SeletorPeriodo valor={dias} onChange={setDias} />

      {q.isPending ? (
        <View accessible accessibilityLabel="Carregando o relatório" style={{ gap: spacing.md }}>
          <Esqueleto largura="100%" altura={96} />
          <Esqueleto largura="100%" altura={160} />
          <Esqueleto largura="100%" altura={200} />
        </View>
      ) : q.error && !r ? (
        <EstadoTela
          tipo="erro"
          titulo="Não foi possível carregar o relatório"
          texto={mensagemDeErro(q.error)}
          acao={{ rotulo: ACOES.tentarDeNovo, onPress: () => void q.refetch(), carregando: q.isFetching }}
        />
      ) : r && r.totalBriefings === 0 ? (
        <EstadoTela
          tipo="vazio"
          titulo="Nenhum briefing no período"
          texto={`O servidor não registrou briefings nos últimos ${dias} dias. Abra o briefing de um trajeto e volte aqui.`}
        />
      ) : r ? (
        <>
          <ListSection titulo={`Últimos ${r.periodo.dias} dias`}>
            <Linha rotulo="Briefings" valor={String(r.totalBriefings)} />
            <Linha rotulo="Trajetos distintos" valor={String(r.trajetosDistintos)} />
          </ListSection>

          <View style={{ gap: spacing.sm }}>
            <ThemedText variant="sectionTitle" accessibilityRole="header" style={{ paddingHorizontal: spacing.xs }}>
              Vereditos por dia
            </ThemedText>
            <GraficoVereditos dias={r.vereditosPorDia} />
          </View>

          <DisponibilidadeProvedores provedores={r.disponibilidadePorProvedor} />

          {r.latenciaMs ? (
            <ListSection titulo="Latência dos briefings" rodape="p50 = metade dos briefings respondeu até este tempo; p95 = 95 em cada 100.">
              <Linha rotulo="p50" valor={`${r.latenciaMs.p50} ms`} />
              <Linha rotulo="p95" valor={`${r.latenciaMs.p95} ms`} />
              <Linha rotulo="Máxima" valor={`${r.latenciaMs.max} ms`} />
            </ListSection>
          ) : null}
        </>
      ) : null}
    </StackScreen>
  );
}
