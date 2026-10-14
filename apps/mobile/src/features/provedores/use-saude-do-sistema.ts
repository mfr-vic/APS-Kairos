// Consultas de saúde usadas por "Estado das fontes" e "Como o Καιρός funciona" (mesmas chaves, mesmo
// formato no cache). O tempo de resposta da API é medido no app (ida e volta).
import { useQuery } from '@tanstack/react-query';

import { api } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';

export function useSaudeDoSistema() {
  const health = useQuery({
    queryKey: queryKeys.health,
    queryFn: async ({ signal }) => {
      const inicio = Date.now();
      const dados = await api.health(signal);
      return { ...dados, latencyMs: Date.now() - inicio };
    },
    staleTime: 0,
    retry: false,
  });
  const providers = useQuery({
    queryKey: queryKeys.providers,
    queryFn: ({ signal }) => api.providers(signal),
    staleTime: 0,
    retry: false,
  });
  return {
    health,
    providers,
    atualizando: health.isFetching || providers.isFetching,
    atualizar: () => Promise.all([health.refetch(), providers.refetch()]),
  };
}
