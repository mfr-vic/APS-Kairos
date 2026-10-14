// Itinerário de uma linha de trilho do trajeto (ex.: /trajetos/abc/itinerario/L2). Detalhe opcional,
// aberto pelo "Ver itinerário" do briefing. Estados: lendo o trajeto · trajeto excluído · linha sem
// itinerário · conteúdo.
import { RailLineSchema, type RailLine } from '@kairos/contracts';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { EstadoTela } from '@/components/estado-tela';
import { useAgora } from '@/features/briefing/format';
import { useUltimoBriefing } from '@/features/briefing/use-briefing';
import { estacoesDaLinha, type DadosLinha } from '@/features/itinerario/estacoes-da-linha';
import { ItinerarioView } from '@/features/itinerario/itinerario-view';
import type { TrajetoSalvo } from '@/features/trajetos/storage';
import { nomeLinhaTrilho } from '@/features/trajetos/linhas-trilho';
import { useTrajeto } from '@/features/trajetos/use-trajetos';
import { ACOES, ESTADOS } from '@/shared/textos';
import { spacing, useColors } from '@/theme';

export default function ItinerarioRoute() {
  const { id, linha: param } = useLocalSearchParams<{ id: string; linha: string }>();
  const trajeto = useTrajeto(id);
  const linha = RailLineSchema.safeParse(param).data ?? null;
  const dados = linha ? estacoesDaLinha(linha) : null;
  const titulo = linha ? nomeLinhaTrilho(linha) : 'Itinerário';

  // Leitura local e rápida: sem esqueleto, para não piscar.
  if (trajeto.isPending) return <Tela titulo={titulo} />;
  if (!trajeto.data) {
    return (
      <Tela titulo={titulo}>
        <EstadoTela
          tipo="vazio"
          titulo={ESTADOS.trajetoNaoEncontrado.titulo}
          texto={ESTADOS.trajetoNaoEncontrado.texto}
          acao={{ rotulo: ACOES.voltarAosTrajetos, onPress: () => router.back() }}
        />
      </Tela>
    );
  }
  if (!linha || !dados) {
    return (
      <Tela titulo={titulo}>
        <EstadoTela
          tipo="vazio"
          titulo="Itinerário indisponível"
          texto="Ainda não há a lista de estações desta linha no Καιρός."
          acao={{ rotulo: 'Voltar', onPress: () => router.back() }}
        />
      </Tela>
    );
  }
  return (
    <>
      <Stack.Screen options={{ title: titulo }} />
      <Conteudo linha={linha} trajeto={trajeto.data} dados={dados} />
    </>
  );
}

function Tela({ titulo, children }: { titulo: string; children?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, padding: spacing.lg, backgroundColor: c.background }}>
      <Stack.Screen options={{ title: titulo }} />
      {children}
    </View>
  );
}

function Conteudo({
  linha,
  trajeto,
  dados,
}: {
  linha: RailLine;
  trajeto: TrajetoSalvo;
  dados: DadosLinha;
}) {
  const briefing = useUltimoBriefing(trajeto);
  const agora = useAgora();
  return (
    <ItinerarioView
      linha={linha}
      trajeto={trajeto}
      dados={dados}
      briefing={briefing}
      agora={agora}
    />
  );
}
