// Linha da gramática única: bloco do ícone no tom + título forte + uma frase de apoio
// (+ acessório opcional à direita). Usada em "O que fazer agora", "Atrasos e obstáculos" e na
// folha de trajetos. Lida como um item só pelo leitor de tela.
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { spacing, type Tom } from '@/theme';

import type { IconName } from './icon';
import { IconeEmBloco } from './icone-em-bloco';
import { ListRow } from './list-row';
import { ThemedText } from './themed-text';
import type { AcaoDeToque } from './use-toque-protegido';

type Props = {
  icone: IconName;
  tom: Tom;
  titulo: string;
  texto?: string;
  /** Prefixo lido antes do título (ex.: "Evite", "Atenção"), quando o tom carrega sentido. */
  rotuloTom?: string;
  acessorio?: ReactNode;
  /** Toque protegido e com háptica (via ListRow); pode devolver uma promessa. */
  onPress?: AcaoDeToque;
  accessibilityHint?: string;
  testID?: string;
};

export function LinhaInformativa({
  icone,
  tom,
  titulo,
  texto,
  rotuloTom,
  acessorio,
  onPress,
  accessibilityHint,
  testID,
}: Props) {
  const rotulo = [rotuloTom, titulo, texto].filter(Boolean).join('. ');
  const conteudo = (
    <>
      <IconeEmBloco icone={icone} tom={tom} />
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <ThemedText variant="bodyStrong">{titulo}</ThemedText>
        {texto ? (
          <ThemedText variant="subhead" tone="textSecondary">
            {texto}
          </ThemedText>
        ) : null}
      </View>
      {acessorio}
    </>
  );
  if (onPress) {
    return (
      <ListRow
        onPress={onPress}
        accessibilityLabel={rotulo}
        accessibilityHint={accessibilityHint}
        style={{ alignItems: 'flex-start' }}
      >
        {conteudo}
      </ListRow>
    );
  }
  return (
    <View testID={testID} accessible accessibilityLabel={rotulo}>
      <ListRow style={{ alignItems: 'flex-start' }}>{conteudo}</ListRow>
    </View>
  );
}
