// Componente único de estado (design system): vazio, erro, offline, desatualizado e sucesso.
// Sempre diz o que aconteceu, o que o app está mostrando e o que a pessoa pode fazer.
//   bloco → ocupa o lugar do conteúdo (nada para mostrar ainda)
//   faixa → acima do conteúdo que continua visível (ex.: briefing salvo com aviso)
// Carregando NÃO usa este componente: é esqueleto com a forma do conteúdo (Esqueleto).
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { coresDoTom, radius, spacing, useColors, type Tom } from '@/theme';

import { Botao } from './botao';
import { Cartao } from './cartao';
import { Icon, type IconName } from './icon';
import { IconeEmBloco } from './icone-em-bloco';
import { ThemedText } from './themed-text';

export type TipoEstado = 'vazio' | 'erro' | 'offline' | 'desatualizado' | 'sucesso';

const PADRAO: Record<TipoEstado, { icone: IconName; tom: Tom }> = {
  vazio: { icone: 'rota', tom: 'neutro' },
  erro: { icone: 'atencao', tom: 'erro' },
  offline: { icone: 'offline', tom: 'atencao' },
  desatualizado: { icone: 'desatualizado', tom: 'atencao' },
  sucesso: { icone: 'favoravel', tom: 'ok' },
};

type Acao = { rotulo: string; onPress: () => void; carregando?: boolean; icone?: IconName };

type Props = {
  tipo: TipoEstado;
  titulo: string;
  texto?: string;
  icone?: IconName;
  acao?: Acao;
  acaoSecundaria?: Acao;
  variante?: 'bloco' | 'faixa';
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function EstadoTela({
  tipo,
  titulo,
  texto,
  icone,
  acao,
  acaoSecundaria,
  variante = 'bloco',
  style,
  testID,
}: Props) {
  const c = useColors();
  const padrao = PADRAO[tipo];
  const nomeIcone = icone ?? padrao.icone;
  // Erro, offline e desatualizado são anunciados ao aparecer; vazio e sucesso, não.
  const anuncia = tipo === 'erro' || tipo === 'offline' || tipo === 'desatualizado';

  if (variante === 'faixa') {
    const { fg, suave } = coresDoTom(c, padrao.tom);
    return (
      <View
        testID={testID}
        style={[
          {
            flexDirection: 'row',
            gap: spacing.md,
            padding: spacing.lg,
            borderRadius: radius.lg,
            borderCurve: 'continuous',
            backgroundColor: suave,
          },
          style,
        ]}
      >
        <Icon name={nomeIcone} size={24} color={fg} />
        <View style={{ flex: 1, gap: spacing.xs }}>
          {/* Texto agrupado e anunciado; o botão fica fora do grupo para continuar focável. */}
          <View
            accessible
            accessibilityRole={anuncia ? 'alert' : undefined}
            accessibilityLiveRegion={anuncia ? 'polite' : undefined}
            accessibilityLabel={texto ? `${titulo}. ${texto}` : titulo}
            style={{ gap: spacing.xs }}
          >
            <ThemedText variant="bodyStrong">{titulo}</ThemedText>
            {texto ? <ThemedText variant="subhead">{texto}</ThemedText> : null}
          </View>
          {acao ? (
            <Botao
              titulo={acao.rotulo}
              icone={acao.icone}
              variante="texto"
              tamanho="sm"
              carregando={acao.carregando}
              onPress={acao.onPress}
              style={{ alignSelf: 'flex-start' }}
            />
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <Cartao
      testID={testID}
      style={[{ alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.md }, style]}
    >
      <IconeEmBloco icone={nomeIcone} tom={padrao.tom} tamanho="lg" />
      <View
        style={{ gap: spacing.xs, alignItems: 'center' }}
        accessible
        accessibilityRole={anuncia ? 'alert' : 'header'}
        accessibilityLiveRegion={anuncia ? 'polite' : undefined}
        accessibilityLabel={texto ? `${titulo}. ${texto}` : titulo}
      >
        <ThemedText variant="headlineStrong" style={{ textAlign: 'center' }}>
          {titulo}
        </ThemedText>
        {texto ? (
          <ThemedText variant="subhead" tone="textSecondary" style={{ textAlign: 'center' }}>
            {texto}
          </ThemedText>
        ) : null}
      </View>
      {acao || acaoSecundaria ? (
        <View style={{ alignSelf: 'stretch', gap: spacing.xs }}>
          {acao ? (
            <Botao
              titulo={acao.rotulo}
              icone={acao.icone}
              variante="primario"
              carregando={acao.carregando}
              onPress={acao.onPress}
            />
          ) : null}
          {acaoSecundaria ? (
            <Botao
              titulo={acaoSecundaria.rotulo}
              icone={acaoSecundaria.icone}
              variante="texto"
              onPress={acaoSecundaria.onPress}
              style={{ alignSelf: 'center' }}
            />
          ) : null}
        </View>
      ) : null}
    </Cartao>
  );
}
