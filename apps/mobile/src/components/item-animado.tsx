// Item de lista NÃO virtualizada (map dentro de ScrollView/ListSection) com o ciclo de vida
// animado: entra escalonado (só quando `escalonar`; o padrão é aparecer junto com a seção),
// sai com fade curto quando removido e os vizinhos deslizam para o lugar (layout 200 ms).
// Nunca use em FlatList/FlashList (linhas recicladas repetiriam a entrada ao rolar).
// Com movimento reduzido, nada anima: o item aparece e some na hora.
import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { entradaEscalonada, SAIDA_DETALHE, TRANSICAO_LAYOUT } from './entrada';

type Props = PropsWithChildren<{
  /** Posição na lista (define o atraso da entrada). */
  indice?: number;
  /** Entra com o stagger; false = aparece sem entrada (só saída e reflow animados). */
  escalonar?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>;

export function ItemAnimado({ indice = 0, escalonar = false, style, testID, children }: Props) {
  const reduzido = useReducedMotion();
  return (
    <Animated.View
      testID={testID}
      entering={reduzido || !escalonar ? undefined : entradaEscalonada(indice)}
      exiting={reduzido ? undefined : SAIDA_DETALHE}
      layout={reduzido ? undefined : TRANSICAO_LAYOUT}
      style={style}
    >
      {children}
    </Animated.View>
  );
}
