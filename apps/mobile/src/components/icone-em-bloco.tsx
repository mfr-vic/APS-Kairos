// Ícone dentro de um bloco arredondado com o fundo suave do tom (linhas de ação, estados,
// obstáculos). O tom repete o código de cor do veredito; o texto ao lado carrega o significado.
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { coresDoTom, radius, useColors, type Tom } from '@/theme';

import { Icon, type IconName } from './icon';

type Props = {
  icone: IconName;
  tom: Tom;
  tamanho?: 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
};

const LADO = { md: 40, lg: 56 } as const;
const ICONE = { md: 20, lg: 32 } as const;

export function IconeEmBloco({ icone, tom, tamanho = 'md', style }: Props) {
  const c = useColors();
  const { fg, suave } = coresDoTom(c, tom);
  return (
    <View
      testID={`icone-em-bloco-${tom}`}
      style={[
        {
          width: LADO[tamanho],
          height: LADO[tamanho],
          borderRadius: tamanho === 'lg' ? radius.lg : radius.md,
          borderCurve: 'continuous',
          backgroundColor: suave,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Icon name={icone} size={ICONE[tamanho]} color={fg} />
    </View>
  );
}
