// "Atualizar" pedido pela pessoa: refaz a consulta e confirma o resultado num snackbar
// ("Briefing atualizado às 08:10" ou a causa da falha). Atualização automática não avisa.
import type { BriefingResponse } from '@kairos/contracts';
import type { QueryObserverResult } from '@tanstack/react-query';

import { useSnackbar } from '@/components/snackbar';
import { mensagemDeErro } from '@/shared/api/errors';
import { feedbackTatil } from '@/shared/feedback-tatil';
import { CONFIRMACOES } from '@/shared/textos';

import { horaSP } from './format';

export function useAtualizarBriefing(
  refetch: () => Promise<QueryObserverResult<BriefingResponse, Error>>
): () => Promise<void> {
  const snackbar = useSnackbar();
  return async () => {
    const r = await refetch();
    if (r.error) {
      feedbackTatil.erro();
      snackbar.mostrar({ tipo: 'erro', mensagem: `Não atualizou: ${mensagemDeErro(r.error)}` });
    } else if (r.data) {
      feedbackTatil.sucesso();
      snackbar.mostrar({ mensagem: CONFIRMACOES.briefingAtualizado(horaSP(r.data.geradoEm)) });
    }
  };
}
