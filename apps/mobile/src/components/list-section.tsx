// Lista agrupada (estilo ajustes/Material): título da seção, superfície arredondada e
// separadores finos entre as linhas. Agrupa por fundo + linhas finas, não por cartões soltos.
// Movimento (ItemAnimado): linha removida some com fade e as de baixo sobem no lugar; linha
// que chega DEPOIS da montagem entra com fade. Na montagem, as linhas aparecem junto com a
// seção (sem "grande entrada", tell #14), a menos que `escalonar` peça o stagger curto.
import { Children, isValidElement, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, shadows, spacing, useColors } from '@/theme';

import { ItemAnimado } from './item-animado';
import { ThemedText } from './themed-text';

type Props = {
  titulo?: string;
  /** Elemento à direita do título (ex.: selo de recência). */
  acessorio?: ReactNode;
  /** Texto pequeno sob o grupo (fonte, observação). */
  rodape?: string;
  /** Linhas entram escalonadas na montagem (lista que a pessoa pediu e está esperando). */
  escalonar?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function ListSection({ titulo, acessorio, rodape, escalonar = false, children, style }: Props) {
  const c = useColors();
  const linhas = Children.toArray(children).filter(isValidElement);
  const chave = (k: string | number | bigint | null, i: number) => String(k ?? i);
  // Linhas da montagem: entram com a seção. Chave que aparece depois = linha nova (entra com fade).
  const [iniciais] = useState(() => new Set(linhas.map((l, i) => chave(l.key, i))));
  return (
    <View style={[{ gap: spacing.sm }, style]}>
      {titulo || acessorio ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.sm,
            paddingHorizontal: spacing.xs,
            flexWrap: 'wrap',
          }}
        >
          {titulo ? (
            <ThemedText variant="overline" tone="textSecondary" accessibilityRole="header">
              {titulo}
            </ThemedText>
          ) : null}
          {acessorio}
        </View>
      ) : null}
      <View
        style={{
          backgroundColor: c.surface,
          borderRadius: radius.lg,
          borderCurve: 'continuous',
          boxShadow: shadows.card,
          overflow: 'hidden',
        }}
      >
        {linhas.map((linha, i) => (
          <ItemAnimado
            key={chave(linha.key, i)}
            indice={iniciais.has(chave(linha.key, i)) ? i : 0}
            escalonar={escalonar || !iniciais.has(chave(linha.key, i))}
          >
            {i > 0 ? (
              <View
                style={{
                  height: StyleSheet.hairlineWidth,
                  backgroundColor: c.separator,
                  marginLeft: spacing.lg,
                }}
              />
            ) : null}
            {linha}
          </ItemAnimado>
        ))}
      </View>
      {rodape ? (
        <ThemedText
          variant="caption"
          tone="textSecondary"
          style={{ paddingHorizontal: spacing.xs }}
        >
          {rodape}
        </ThemedText>
      ) : null}
    </View>
  );
}
