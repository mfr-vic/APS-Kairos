// Acesso aos trajetos via TanStack Query: a lista reflete na hora as edições e exclusões (TC05).
// A fonte da verdade é o AsyncStorage; por isso estas consultas não passam pelo persister.
// useTrajetos() devolve a lista JÁ na ordem da hierarquia (ordenar-trajetos.ts): favoritos,
// depois frecência com afinidade de horário. Todas as telas (início, folha de seleção, ações)
// leem a mesma ordem; o cache guarda a lista crua, na ordem de cadastro.
import type { BriefingResponse } from '@kairos/contracts';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useCallback } from 'react';

import { queryKeys } from '@/shared/api/query-keys';

import { ordenarTrajetos } from './ordenar-trajetos';
import {
  trajetoStore,
  usoStore,
  type DadosTrajeto,
  type TrajetoSalvo,
  type UsoTrajetos,
} from './storage';

// Armazenamento local: não depende de rede nem vence com o tempo.
const LOCAL = { networkMode: 'always', staleTime: Infinity } as const;

/** Chave própria (fora de ['trajetos', …] para não colidir com queryKeys.trajeto(id)). */
export const CHAVE_USO_QUERY = ['uso-trajetos'] as const;

/** A ordem por horário muda em degraus de 15 min: a lista não "pula" a cada re-render. */
const DEGRAU_MS = 15 * 60_000;
const degrauAtual = () => Math.floor(Date.now() / DEGRAU_MS) * DEGRAU_MS;

export function useUsoTrajetos() {
  return useQuery({ queryKey: CHAVE_USO_QUERY, queryFn: usoStore.ler, ...LOCAL });
}

export function useTrajetos() {
  const uso = useUsoTrajetos();
  const usoData = uso.data;
  const degrau = degrauAtual();
  const select = useCallback(
    (lista: TrajetoSalvo[]) => ordenarTrajetos(lista, usoData ?? {}, degrau),
    [usoData, degrau]
  );
  return useQuery({
    queryKey: queryKeys.trajetos,
    queryFn: trajetoStore.listar,
    // Espera o histórico (leitura local, rápida) para a lista não aparecer e depois reordenar.
    enabled: !uso.isPending,
    select,
    ...LOCAL,
  });
}

/** A mesma ordem de useTrajetos(), lida do cache (para callbacks fora de render, ex.: Desfazer). */
export function trajetosOrdenadosDoCache(qc: QueryClient): TrajetoSalvo[] {
  return ordenarTrajetos(
    qc.getQueryData<TrajetoSalvo[]>(queryKeys.trajetos) ?? [],
    qc.getQueryData<UsoTrajetos>(CHAVE_USO_QUERY) ?? {},
    degrauAtual()
  );
}

/** Abrir o briefing = um uso (só no aparelho). Repetições em 30 min contam uma vez. */
export function useRegistrarUso() {
  const qc = useQueryClient();
  return useMutation({
    networkMode: 'always',
    mutationFn: (id: string) =>
      usoStore.registrar(
        id,
        qc.getQueryData<TrajetoSalvo[]>(queryKeys.trajetos)?.map((t) => t.id)
      ),
    onSuccess: (novo) => qc.setQueryData(CHAVE_USO_QUERY, novo),
  });
}

/**
 * Favoritar/desfavoritar com atualização otimista: a estrela muda no mesmo quadro do toque
 * (e do haptic); se a gravação falhar, a lista volta ao que era.
 */
export function useDefinirFavorito() {
  const qc = useQueryClient();
  return useMutation({
    networkMode: 'always',
    mutationFn: ({ id, favorito }: { id: string; favorito: boolean }) =>
      trajetoStore.definirFavorito(id, favorito),
    onMutate: async ({ id, favorito }) => {
      await qc.cancelQueries({ queryKey: queryKeys.trajetos, exact: true });
      const antes = qc.getQueryData<TrajetoSalvo[]>(queryKeys.trajetos);
      if (antes) {
        qc.setQueryData(
          queryKeys.trajetos,
          antes.map((t) => (t.id === id ? { ...t, favorito } : t))
        );
      }
      return { antes };
    },
    onError: (_erro, _vars, ctx) => {
      if (ctx?.antes) qc.setQueryData(queryKeys.trajetos, ctx.antes);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.trajetos }),
  });
}

export function useTrajeto(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.trajeto(id ?? ''),
    queryFn: () => trajetoStore.obter(id ?? ''),
    enabled: !!id,
    ...LOCAL,
  });
}

export function useSalvarTrajeto() {
  const qc = useQueryClient();
  return useMutation({
    networkMode: 'always',
    mutationFn: ({ id, dados }: { id?: string; dados: DadosTrajeto }) =>
      id ? trajetoStore.atualizar(id, dados) : trajetoStore.criar(dados),
    onSuccess: async (salvo) => {
      // Briefings de versões anteriores deste trajeto deixam de valer.
      qc.removeQueries({
        queryKey: queryKeys.briefingsDoTrajeto(salvo.id),
        predicate: (q) => q.queryKey[2] !== salvo.atualizadoEm,
      });
      await qc.invalidateQueries({ queryKey: queryKeys.trajetos });
    },
  });
}

/** `null` desfaz a fixação (o primeiro da hierarquia volta a ser o principal). Devolve o anterior. */
export function useDefinirPrincipal() {
  const qc = useQueryClient();
  return useMutation({
    networkMode: 'always',
    mutationFn: (id: string | null) => trajetoStore.definirPrincipal(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.trajetos }),
  });
}

/** Tudo o que o Desfazer precisa para devolver o trajeto como era, inclusive o briefing salvo. */
export type ExclusaoDesfazivel = {
  trajeto: TrajetoSalvo;
  indice: number;
  briefings: [QueryKey, BriefingResponse | undefined][];
};

export function useExcluirTrajeto() {
  const qc = useQueryClient();
  return useMutation({
    networkMode: 'always',
    mutationFn: async (id: string): Promise<ExclusaoDesfazivel | null> => {
      const briefings = qc.getQueriesData<BriefingResponse>({
        queryKey: queryKeys.briefingsDoTrajeto(id),
      });
      const r = await trajetoStore.excluir(id);
      return r ? { ...r, briefings } : null;
    },
    onSuccess: async (_, id) => {
      // Sem isto, o briefing do trajeto excluído continuaria alimentando Alertas e o mapa.
      qc.removeQueries({ queryKey: queryKeys.briefingsDoTrajeto(id) });
      await qc.invalidateQueries({ queryKey: queryKeys.trajetos });
    },
  });
}

export function useRestaurarTrajeto() {
  const qc = useQueryClient();
  return useMutation({
    networkMode: 'always',
    mutationFn: (e: ExclusaoDesfazivel) => trajetoStore.restaurar(e.trajeto, e.indice),
    onSuccess: async (_, e) => {
      for (const [chave, dados] of e.briefings) if (dados) qc.setQueryData(chave, dados);
      await qc.invalidateQueries({ queryKey: queryKeys.trajetos });
    },
  });
}
