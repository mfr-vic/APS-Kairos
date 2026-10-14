// Folha de ações de um trajeto (aberta pelo botão "Mais ações" do cartão ou pelo toque longo):
// ver briefing, favoritar/remover dos favoritos, tornar principal (ou voltar ao automático),
// editar e excluir — todas visíveis, nada escondido em gesto.
// Excluir é imediato e reversível pelo Desfazer do snackbar (sem diálogo de confirmação).
import { View } from 'react-native';

import { LinhaInformativa } from '@/components/linha-informativa';
import { ListSection } from '@/components/list-section';
import { ThemedText } from '@/components/themed-text';
import { ACOES } from '@/shared/textos';
import { spacing } from '@/theme';

import type { TrajetoSalvo } from './storage';
import { TEXTOS_FAVORITO } from './use-acoes-trajeto';

type Props = {
  trajeto: TrajetoSalvo;
  /** É o trajeto do topo da tela inicial (fixado ou o primeiro da hierarquia). */
  principal: boolean;
  onVerBriefing: () => void;
  onAlternarFavorito: () => void;
  onTornarPrincipal: () => void;
  /** Só aparece quando ESTE trajeto foi fixado pela pessoa. */
  onPrincipalAutomatico: () => void;
  onEditar: () => void;
  onExcluir: () => void;
};

export function AcoesTrajeto({
  trajeto: t,
  principal,
  onVerBriefing,
  onAlternarFavorito,
  onTornarPrincipal,
  onPrincipalAutomatico,
  onEditar,
  onExcluir,
}: Props) {
  const favorito = t.favorito === true;
  const fixado = t.principal === true;
  const estado = [favorito ? 'favorito' : null, principal ? (fixado ? 'principal fixado' : 'principal agora') : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.xxs }}>
        <ThemedText variant="title" accessibilityRole="header" numberOfLines={2}>
          {t.nome}
        </ThemedText>
        <ThemedText variant="subhead" tone="textSecondary">
          {t.trajeto.origem.rotulo} → {t.trajeto.destino.rotulo}
          {estado ? ` · ${estado}` : ''}
        </ThemedText>
      </View>
      <ListSection>
        <LinhaInformativa
          icone="rota"
          tom="ok"
          titulo={ACOES.verBriefing}
          texto="Veredito, o que fazer agora e os dados de cada fonte."
          onPress={onVerBriefing}
        />
        <LinhaInformativa
          icone={favorito ? 'principal' : 'principalVazio'}
          tom={favorito ? 'neutro' : 'ok'}
          titulo={favorito ? TEXTOS_FAVORITO.desfavoritar : TEXTOS_FAVORITO.favoritar}
          texto={
            favorito
              ? 'Sai da seção Favoritos; dá para desfazer por 5 segundos.'
              : 'Fica no topo da lista, na seção Favoritos.'
          }
          onPress={onAlternarFavorito}
        />
        {fixado ? (
          <LinhaInformativa
            icone="atualizar"
            tom="neutro"
            titulo={TEXTOS_FAVORITO.principalAutomatico}
            texto="Deixa de fixar este trajeto: o topo passa a seguir seus favoritos e horários."
            onPress={onPrincipalAutomatico}
          />
        ) : (
          <LinhaInformativa
            icone="janela"
            tom="ok"
            titulo={ACOES.tornarPrincipal}
            texto="Fixa este trajeto no topo da tela inicial, com o veredito, em qualquer horário."
            onPress={onTornarPrincipal}
          />
        )}
        <LinhaInformativa
          icone="editar"
          tom="neutro"
          titulo={ACOES.editar}
          texto="Nome, origem, destino e linhas de ônibus, metrô e trem."
          onPress={onEditar}
        />
        <LinhaInformativa
          icone="excluir"
          tom="erro"
          titulo={ACOES.excluirTrajeto}
          texto="Sai da lista na hora; dá para desfazer por 5 segundos."
          onPress={onExcluir}
        />
      </ListSection>
    </View>
  );
}
