// "Compartilhar briefing": folha nativa (Share.share) com o texto pt-BR do briefing.
// Enviado → snackbar "Briefing enviado"; cancelar não é erro (nada a mostrar); falha → causa.
import type { BriefingResponse } from '@kairos/contracts';
import { Share } from 'react-native';

import { Botao } from '@/components/botao';
import { useSnackbar } from '@/components/snackbar';
import { feedbackTatil } from '@/shared/feedback-tatil';
import { ACOES, CONFIRMACOES } from '@/shared/textos';

import { textoParaCompartilhar } from './texto-para-compartilhar';

type Props = { nomeTrajeto: string; briefing: BriefingResponse };

export function BotaoCompartilhar({ nomeTrajeto, briefing }: Props) {
  const snackbar = useSnackbar();
  async function compartilhar() {
    try {
      const r = await Share.share({
        title: `Καιρός · ${nomeTrajeto}`,
        message: textoParaCompartilhar(nomeTrajeto, briefing),
      });
      if (r.action === Share.sharedAction) {
        feedbackTatil.sucesso();
        snackbar.mostrar({ mensagem: CONFIRMACOES.briefingCompartilhado });
      }
    } catch {
      feedbackTatil.erro();
      snackbar.mostrar({ tipo: 'erro', mensagem: CONFIRMACOES.falhaAoCompartilhar });
    }
  }
  return <Botao titulo={ACOES.compartilhar} icone="compartilhar" onPress={compartilhar} />;
}
