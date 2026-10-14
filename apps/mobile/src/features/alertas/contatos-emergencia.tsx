// Fim da aba Alertas: dois cartões lado a lado (Defesa Civil 199, Bombeiros 193) que abrem o
// discador com o número preenchido; a pessoa só conclui a ligação (sem permissão CALL_PHONE).
// Não usa Linking.canOpenURL: no Android 11+ ele devolve false para `tel:` sem um <queries> no
// manifesto, mesmo com discador; tentar abrir e tratar a falha é o caminho confiável.
import { Linking, View } from 'react-native';

import { Cartao } from '@/components/cartao';
import { IconeEmBloco } from '@/components/icone-em-bloco';
import type { IconName } from '@/components/icon';
import { useSnackbar } from '@/components/snackbar';
import { ThemedText } from '@/components/themed-text';
import { feedbackTatil } from '@/shared/feedback-tatil';
import { spacing } from '@/theme';

type Contato = { nome: string; numero: string; artigo: string; icone: IconName };

export const CONTATOS_EMERGENCIA: readonly Contato[] = [
  { nome: 'Defesa Civil', numero: '199', artigo: 'a', icone: 'escudo' },
  { nome: 'Bombeiros', numero: '193', artigo: 'os', icone: 'fogo' },
];

export function ContatosEmergencia() {
  const snackbar = useSnackbar();

  const discar = async ({ nome, numero }: Contato) => {
    try {
      await Linking.openURL(`tel:${numero}`);
    } catch {
      feedbackTatil.erro();
      snackbar.mostrar({
        tipo: 'erro',
        mensagem: `Não deu para abrir o discador. Ligue ${numero} (${nome}) pelo telefone.`,
      });
    }
  };

  return (
    <View style={{ flexDirection: 'row', gap: spacing.md }}>
      {CONTATOS_EMERGENCIA.map((c) => (
        <Cartao
          key={c.numero}
          testID={`contato-${c.numero}`}
          onPress={() => discar(c)}
          accessibilityLabel={`Ligar para ${c.artigo} ${c.nome}, ${c.numero} — abre o discador`}
          accessibilityHint="Abre o telefone com o número digitado; você confirma a ligação."
          avisoProcessando="Abrindo o discador…"
          style={{ flex: 1, alignItems: 'center', gap: spacing.xs }}
        >
          <IconeEmBloco icone={c.icone} tom="erro" />
          <ThemedText variant="metricLg">{c.numero}</ThemedText>
          <ThemedText variant="subhead" tone="textSecondary">
            {c.nome}
          </ThemedText>
        </Cartao>
      ))}
    </View>
  );
}
