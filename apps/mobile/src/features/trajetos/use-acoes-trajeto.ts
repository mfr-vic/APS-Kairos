// Ações sobre trajetos com retorno perceptível: snackbar com a mensagem específica, Desfazer
// por 5 s quando a ação é reversível e haptic no instante da confirmação (nunca sozinho).
// Usa mutateAsync: o Desfazer roda depois que a tela de origem (ex.: Editar) já saiu, e os
// callbacks de `mutate` não disparam em componente desmontado.
import { useQueryClient } from '@tanstack/react-query';

import { useSnackbar } from '@/components/snackbar';
import { feedbackTatil } from '@/shared/feedback-tatil';
import { ACOES, CONFIRMACOES } from '@/shared/textos';

import { trajetoPrincipal, type TrajetoSalvo } from './storage';
import {
  trajetosOrdenadosDoCache,
  useDefinirFavorito,
  useDefinirPrincipal,
  useExcluirTrajeto,
  useRestaurarTrajeto,
} from './use-trajetos';

/** Textos dos favoritos e do principal automático (específicos desta feature). */
export const TEXTOS_FAVORITO = {
  favoritar: 'Favoritar',
  desfavoritar: 'Remover dos favoritos',
  selo: 'Favorito',
  favoritado: (nome: string) => `“${nome}” nos favoritos`,
  desfavoritado: (nome: string) => `“${nome}” saiu dos favoritos`,
  falha: 'Não foi possível mudar os favoritos. Tente de novo.',
  principalAutomatico: 'Principal automático',
  automaticoAtivado: 'Principal automático: o topo segue seus favoritos e horários',
} as const;

export function useAcoesTrajeto() {
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const definir = useDefinirPrincipal();
  const favoritar = useDefinirFavorito();
  const excluir = useExcluirTrajeto();
  const restaurar = useRestaurarTrajeto();

  // Depois do mutateAsync a lista já foi invalidada e relida (onSuccess é aguardado).
  const nomeDoPrincipal = () => trajetoPrincipal(trajetosOrdenadosDoCache(qc))?.nome;

  const falhou = (mensagem: string) => {
    feedbackTatil.erro();
    snackbar.mostrar({ tipo: 'erro', mensagem });
  };

  /** Desfazer comum às trocas de principal: volta ao `anterior` (null = automático). */
  const desfazerPrincipal = (anterior: string | null) => ({
    rotulo: ACOES.desfazer,
    onPress: async () => {
      try {
        await definir.mutateAsync(anterior);
        feedbackTatil.sucesso();
        const nome = nomeDoPrincipal();
        snackbar.mostrar({
          mensagem: nome ? CONFIRMACOES.principalRestaurado(nome) : 'Principal anterior restaurado',
        });
      } catch {
        falhou(CONFIRMACOES.falhaAoDesfazer);
      }
    },
  });

  async function tornarPrincipal(t: TrajetoSalvo) {
    try {
      const { anterior } = await definir.mutateAsync(t.id);
      feedbackTatil.sucesso();
      snackbar.mostrar({
        mensagem: CONFIRMACOES.principalDefinido(t.nome),
        acao: desfazerPrincipal(anterior),
      });
    } catch {
      falhou(CONFIRMACOES.falhaAoSalvarPrincipal);
    }
  }

  /** Desfaz a fixação: o topo volta a seguir a hierarquia (favoritos + horário). */
  async function principalAutomatico() {
    try {
      const { anterior } = await definir.mutateAsync(null);
      feedbackTatil.sucesso();
      snackbar.mostrar({
        mensagem: TEXTOS_FAVORITO.automaticoAtivado,
        acao: anterior ? desfazerPrincipal(anterior) : undefined,
      });
    } catch {
      falhou(CONFIRMACOES.falhaAoSalvarPrincipal);
    }
  }

  /**
   * Favoritar/desfavoritar. A estrela muda na hora (otimista) junto com o haptic; o snackbar
   * confirma e oferece Desfazer. Favoritar = sucesso; tirar = seleção (não é destrutivo).
   */
  async function alternarFavorito(t: TrajetoSalvo) {
    const favorito = t.favorito !== true;
    if (favorito) feedbackTatil.sucesso();
    else feedbackTatil.selecao();
    try {
      await favoritar.mutateAsync({ id: t.id, favorito });
      snackbar.mostrar({
        mensagem: favorito ? TEXTOS_FAVORITO.favoritado(t.nome) : TEXTOS_FAVORITO.desfavoritado(t.nome),
        acao: {
          rotulo: ACOES.desfazer,
          onPress: async () => {
            try {
              await favoritar.mutateAsync({ id: t.id, favorito: !favorito });
              feedbackTatil.selecao();
              snackbar.mostrar({
                mensagem: favorito
                  ? TEXTOS_FAVORITO.desfavoritado(t.nome)
                  : TEXTOS_FAVORITO.favoritado(t.nome),
              });
            } catch {
              falhou(CONFIRMACOES.falhaAoDesfazer);
            }
          },
        },
      });
    } catch {
      falhou(TEXTOS_FAVORITO.falha);
    }
  }

  /** Exclui na hora (sem diálogo) e oferece Desfazer. `aoExcluir` roda antes do snackbar (ex.: voltar). */
  async function excluirComDesfazer(t: TrajetoSalvo, aoExcluir?: () => void) {
    try {
      const snap = await excluir.mutateAsync(t.id);
      feedbackTatil.destrutivo();
      aoExcluir?.();
      snackbar.mostrar({
        mensagem: CONFIRMACOES.trajetoExcluido(t.nome),
        acao: snap
          ? {
              rotulo: ACOES.desfazer,
              onPress: async () => {
                try {
                  await restaurar.mutateAsync(snap);
                  feedbackTatil.sucesso();
                  snackbar.mostrar({ mensagem: CONFIRMACOES.trajetoRestaurado(t.nome) });
                } catch {
                  falhou(CONFIRMACOES.falhaAoDesfazer);
                }
              },
            }
          : undefined,
      });
    } catch {
      falhou(CONFIRMACOES.falhaAoExcluir);
    }
  }

  return {
    tornarPrincipal,
    principalAutomatico,
    alternarFavorito,
    excluirComDesfazer,
    excluindo: excluir.isPending,
    definindoPrincipal: definir.isPending,
    favoritando: favoritar.isPending,
  };
}
