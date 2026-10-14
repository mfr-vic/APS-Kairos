// Componentes tocáveis com superfície animada (ListRow, Cartao) têm duas camadas: o Pressable
// (que o pai posiciona) e a Animated.View (que acende/escala). O `style` de quem chama mistura as
// duas coisas; o que diz como o componente ocupa o pai (flex, largura, alinhamento) tem de ir no
// Pressable, senão um `flex: 1` numa linha não estica nada (defeito de 13/10: estrela do cartão
// de trajeto fora do lugar e widgets de emergência encolhidos).
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

export function separarEstilo(style: StyleProp<ViewStyle>): { fora: ViewStyle; dentro: ViewStyle } {
  const { flex, flexGrow, flexShrink, flexBasis, alignSelf, width, minWidth, maxWidth, ...dentro } =
    StyleSheet.flatten(style) ?? {};
  const fora = Object.fromEntries(
    Object.entries({ flex, flexGrow, flexShrink, flexBasis, alignSelf, width, minWidth, maxWidth }).filter(
      ([, v]) => v !== undefined
    )
  ) as ViewStyle;
  // A superfície preenche o Pressable (ex.: cartões lado a lado com a mesma altura).
  return { fora, dentro: { flexGrow: 1, ...dentro } };
}
