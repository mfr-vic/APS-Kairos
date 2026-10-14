// Último briefing em cache de cada trajeto (memória ou persister), sem disparar requisição.
import type { BriefingResponse } from '@kairos/contracts';
import { useQueries } from '@tanstack/react-query';

import { montarBriefingRequest } from '@/features/briefing/use-briefing';
import type { TrajetoSalvo } from '@/features/trajetos/storage';
import { api } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';

export function useBriefingsDosTrajetos(
  trajetos: readonly TrajetoSalvo[]
): Record<string, BriefingResponse | undefined> {
  return useQueries({
    queries: trajetos.map((t) => ({
      queryKey: queryKeys.briefing(t.id, t.atualizadoEm),
      queryFn: ({ signal }: { signal: AbortSignal }) => api.briefing(montarBriefingRequest(t), signal),
      enabled: false,
    })),
    combine: (rs) => Object.fromEntries(trajetos.map((t, i) => [t.id, rs[i]?.data])),
  });
}
