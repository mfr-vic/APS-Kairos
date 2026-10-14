// Seção de tela: título forte + conteúdo (Cartao ou ListSection) + rodapé opcional.
// Gramática única das telas principais: toda seção = título + cartão; ação da seção à direita
// do título ("Ver todas", "Novo"). Entra com o fade curto de Entrada.
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { spacing } from '@/theme';

import { Botao } from './botao';
import { Entrada } from './entrada';
import type { IconName } from './icon';
import { ThemedText } from './themed-text';

type Props = {
  titulo: string;
  /** Elemento pequeno à direita do título (ex.: recência "às 08:08"). */
  acessorio?: ReactNode;
  /** Ação da seção, à direita do título. */
  acao?: { rotulo: string; onPress: () => void; icone?: IconName; accessibilityLabel?: string };
  rodape?: string;
  children: ReactNode;
  /** Anima mudanças de altura (conteúdo que expande). */
  comLayout?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Secao({ titulo, acessorio, acao, rodape, children, comLayout, style, testID }: Props) {
  return (
    <Entrada comLayout={comLayout} style={[{ gap: spacing.sm }, style]} testID={testID}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingHorizontal: spacing.xs,
          minHeight: 32,
        }}
      >
        <ThemedText variant="sectionTitle" accessibilityRole="header" style={{ flex: 1 }}>
          {titulo}
        </ThemedText>
        {acessorio}
        {acao ? (
          <Botao
            titulo={acao.rotulo}
            icone={acao.icone}
            variante="texto"
            tamanho="sm"
            accessibilityLabel={acao.accessibilityLabel}
            onPress={acao.onPress}
          />
        ) : null}
      </View>
      {children}
      {rodape ? (
        <ThemedText variant="caption" tone="textSecondary" style={{ paddingHorizontal: spacing.xs }}>
          {rodape}
        </ThemedText>
      ) : null}
    </Entrada>
  );
}
