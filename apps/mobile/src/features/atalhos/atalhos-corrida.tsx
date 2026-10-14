// "Ir de carro por aplicativo": dois atalhos SÓ DE TEXTO (sem logotipo, decisão de 14/10/2026), com a
// nota de que são atalhos. Uber abre com origem e destino preenchidos; a 99 não tem link documentado
// com destino, então o endereço vai para a área de transferência e o snackbar avisa.
// Anti-duplo-toque, "processando" e háptica leve vêm do Botao.
import type { Address } from '@kairos/contracts';
import * as Clipboard from 'expo-clipboard';
import { Linking, Platform, View } from 'react-native';

import { Botao } from '@/components/botao';
import { useSnackbar } from '@/components/snackbar';
import { ThemedText } from '@/components/themed-text';
import { spacing } from '@/theme';

import { link99, linkUber, textoDoDestino } from './links-de-corrida';

export const NOTA_ATALHO = 'Atalho: abre o app da empresa; o Καιρός não tem vínculo com ela.';
export const AVISO_COPIADO_99 = 'Endereço do destino copiado — cole na 99';

type Props = {
  origem: Address;
  destino: Address;
  /** Título acima dos botões (no briefing); no mapa, a própria barra já diz o que é. */
  titulo?: string;
};

export function AtalhosCorrida({ origem, destino, titulo = 'Ir de carro por aplicativo' }: Props) {
  const snackbar = useSnackbar();

  const falhou = (app: string) =>
    snackbar.mostrar({ tipo: 'erro', mensagem: `Este aparelho não abriu ${app}. Tente de novo.` });

  async function abrirUber() {
    try {
      await Linking.openURL(linkUber(origem, destino));
    } catch {
      falhou('o Uber');
    }
  }

  async function abrir99() {
    try {
      await Clipboard.setStringAsync(textoDoDestino(destino));
      snackbar.mostrar({ tipo: 'info', mensagem: AVISO_COPIADO_99 });
    } catch {
      // sem área de transferência: abre mesmo assim; a pessoa digita o destino
    }
    try {
      await Linking.openURL(link99(Platform.OS));
    } catch {
      falhou('a 99');
    }
  }

  return (
    <View style={{ gap: spacing.xs }} testID="atalhos-corrida">
      <ThemedText variant="subheadStrong" accessibilityRole="header">
        {titulo}
      </ThemedText>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Botao
          titulo="Abrir no Uber"
          tamanho="sm"
          style={{ flex: 1 }}
          onPress={abrirUber}
          accessibilityLabel="Abrir no Uber. Atalho para o app da empresa, com a origem e o destino do trajeto preenchidos."
        />
        <Botao
          titulo="Abrir na 99"
          tamanho="sm"
          style={{ flex: 1 }}
          onPress={abrir99}
          accessibilityLabel="Abrir na 99. Atalho para o app da empresa; o endereço do destino é copiado para você colar."
        />
      </View>
      <ThemedText variant="caption" tone="textSecondary">
        {NOTA_ATALHO}
      </ThemedText>
    </View>
  );
}
