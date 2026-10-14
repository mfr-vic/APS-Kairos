// Folha nativa (formSheet) com as ações de um trajeto. Ver features/trajetos/acoes-trajeto.tsx.
import { useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { EstadoTela } from '@/components/estado-tela';
import { AcoesTrajeto } from '@/features/trajetos/acoes-trajeto';
import { trajetoPrincipal } from '@/features/trajetos/storage';
import { useAcoesTrajeto } from '@/features/trajetos/use-acoes-trajeto';
import { useTrajetos } from '@/features/trajetos/use-trajetos';
import { useNavegacao } from '@/shared/navegacao/use-navegacao';
import { ACOES, ESTADOS } from '@/shared/textos';
import { spacing, useColors } from '@/theme';

export default function AcoesTrajetoScreen() {
  const c = useColors();
  const nav = useNavegacao();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: trajetos = [] } = useTrajetos();
  const { tornarPrincipal, principalAutomatico, alternarFavorito, excluirComDesfazer } =
    useAcoesTrajeto();
  const t = trajetos.find((x) => x.id === id);
  const principal = trajetoPrincipal(trajetos)?.id === id;

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
    >
      {t ? (
        <AcoesTrajeto
          trajeto={t}
          principal={principal}
          onVerBriefing={() => {
            nav.trocarPor({ pathname: '/trajetos/[id]/briefing', params: { id: t.id } });
          }}
          onAlternarFavorito={() => {
            // Só age se a folha fechou agora: o 2º toque durante a transição é ignorado.
            if (nav.voltar()) alternarFavorito(t);
          }}
          onTornarPrincipal={() => {
            if (nav.voltar()) tornarPrincipal(t);
          }}
          onPrincipalAutomatico={() => {
            if (nav.voltar()) principalAutomatico();
          }}
          onEditar={() => {
            nav.trocarPor({ pathname: '/trajetos/[id]/editar', params: { id: t.id } });
          }}
          onExcluir={() => excluirComDesfazer(t, () => nav.voltar())}
        />
      ) : (
        <EstadoTela
          tipo="vazio"
          titulo={ESTADOS.trajetoNaoEncontrado.titulo}
          texto={ESTADOS.trajetoNaoEncontrado.texto}
          acao={{ rotulo: ACOES.voltarAosTrajetos, onPress: () => nav.voltar() }}
        />
      )}
    </ScrollView>
  );
}
