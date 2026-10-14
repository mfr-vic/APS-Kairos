// Conteúdo da folha "Trajeto em destaque" (rota em formSheet): busca no topo, ação principal
// "Novo trajeto" e a lista com ícone, origem → destino, último veredito e ✓ no escolhido.
// Escolher outro trajeto o torna principal (com Desfazer, na tela inicial).
import { useState } from 'react';
import { View } from 'react-native';

import { Botao } from '@/components/botao';
import { Icon } from '@/components/icon';
import { IconeEmBloco } from '@/components/icone-em-bloco';
import { ListRow } from '@/components/list-row';
import { ListSection } from '@/components/list-section';
import { ThemedText } from '@/components/themed-text';
import { VEREDITO } from '@/features/briefing/format';
import { useUltimoBriefing } from '@/features/briefing/use-briefing';
import { ACOES } from '@/shared/textos';
import { spacing, useColors } from '@/theme';

import { Campo } from './campo';
import type { TrajetoSalvo } from './storage';

type Props = {
  trajetos: TrajetoSalvo[];
  principalId: string | undefined;
  onEscolher: (t: TrajetoSalvo) => void;
  onNovo: () => void;
  /** Título "Trajeto em destaque" dentro da folha; false quando o cabeçalho nativo já o mostra. */
  comTitulo?: boolean;
};

/** Filtro sem acento e sem caixa por nome, origem e destino. */
export function filtrarTrajetos(lista: TrajetoSalvo[], termo: string): TrajetoSalvo[] {
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  const q = norm(termo.trim());
  if (!q) return lista;
  return lista.filter((t) =>
    [t.nome, t.trajeto.origem.rotulo, t.trajeto.destino.rotulo].some((s) => norm(s).includes(q))
  );
}

export function SeletorTrajeto({ trajetos, principalId, onEscolher, onNovo, comTitulo = true }: Props) {
  const [termo, setTermo] = useState('');
  const filtrados = filtrarTrajetos(trajetos, termo);

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.xxs }}>
        {comTitulo ? (
          <ThemedText variant="title" accessibilityRole="header">
            Trajeto em destaque
          </ThemedText>
        ) : null}
        <ThemedText variant="subhead" tone="textSecondary">
          O escolhido vira o principal: aparece no topo da tela inicial com o veredito.
        </ThemedText>
      </View>
      {trajetos.length > 3 ? (
        <Campo
          rotulo="Buscar trajeto"
          valor={termo}
          placeholder="Nome, origem ou destino"
          icone="busca"
          onChange={setTermo}
        />
      ) : null}
      <Botao titulo={ACOES.novoTrajeto} variante="primario" icone="mais" onPress={onNovo} />
      <ListSection titulo={`Seus trajetos (${trajetos.length})`}>
        {filtrados.length === 0 ? (
          <ListRow>
            <ThemedText variant="subhead" tone="textSecondary" style={{ flex: 1 }}>
              Nenhum trajeto com “{termo.trim()}”. Confira a grafia ou cadastre um novo.
            </ThemedText>
          </ListRow>
        ) : (
          filtrados.map((t) => (
            <ItemSeletor
              key={t.id}
              trajeto={t}
              escolhido={t.id === principalId}
              onPress={() => onEscolher(t)}
            />
          ))
        )}
      </ListSection>
    </View>
  );
}

function ItemSeletor({
  trajeto: t,
  escolhido,
  onPress,
}: {
  trajeto: TrajetoSalvo;
  escolhido: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  const ultimo = useUltimoBriefing(t);
  const v = ultimo ? VEREDITO[ultimo.veredito] : null;
  return (
    <ListRow
      onPress={onPress}
      accessibilityLabel={`${t.nome}, de ${t.trajeto.origem.rotulo} a ${t.trajeto.destino.rotulo}${v ? `. Último veredito: ${v.rotulo}` : ''}`}
      accessibilityState={{ selected: escolhido }}
      accessibilityHint={escolhido ? 'Já é o trajeto em destaque' : 'Torna este o trajeto principal'}
      style={escolhido ? { backgroundColor: c.decisaoSoft } : undefined}
    >
      <IconeEmBloco icone={v?.icone ?? 'rota'} tom={v?.tom ?? 'neutro'} />
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <ThemedText variant="bodyStrong" numberOfLines={1}>
          {t.nome}
        </ThemedText>
        <ThemedText variant="subhead" tone="textSecondary" numberOfLines={1}>
          {t.trajeto.origem.rotulo} → {t.trajeto.destino.rotulo}
          {v ? ` · ${v.rotulo}` : ''}
        </ThemedText>
      </View>
      {escolhido ? <Icon name="marcado" size={24} color={c.tint} /> : null}
    </ListRow>
  );
}
