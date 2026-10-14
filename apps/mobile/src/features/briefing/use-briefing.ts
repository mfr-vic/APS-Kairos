// RF05 / RF17: briefing de um trajeto.
//
// Usamos useQuery (e não useMutation) para o POST /v1/briefings porque, para o app,
// pedir o briefing é uma LEITURA idempotente: não cria nada que o usuário veja depois.
// Com query ganhamos o que a C.6 pede — staleTime de 60 s, refetch ao voltar ao primeiro
// plano, cache por trajeto — e o persister grava/restaura o último resultado (mutations
// não guardam o dado retornado no cache). Em caso de erro a query mantém o último `data`,
// que é exatamente o "último briefing + aviso de desatualização" do TC19/TC20.
import type { BriefingRequest, BriefingResponse } from '@kairos/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import type { TrajetoSalvo } from '@/features/trajetos/storage';
import { api } from '@/shared/api/client';
import { CHAVE_BRIEFING, queryKeys } from '@/shared/api/query-keys';

/** O trajeto salvo já passou pelo TrajetoRequestSchema (com ônibus e trilhos): vai como está. */
export function montarBriefingRequest(trajeto: TrajetoSalvo): BriefingRequest {
  return { trajeto: trajeto.trajeto };
}

export function useBriefing(trajeto: TrajetoSalvo | null | undefined) {
  return useQuery({
    queryKey: queryKeys.briefing(trajeto?.id ?? '', trajeto?.atualizadoEm ?? ''),
    queryFn: ({ signal }) => api.briefing(montarBriefingRequest(trajeto!), signal),
    enabled: !!trajeto,
  });
}

/**
 * Último briefing já guardado (memória ou persister) deste trajeto, sem disparar requisição:
 * a lista de trajetos mostra o veredito anterior sem consultar a API (nenhuma chamada nova).
 */
export function useUltimoBriefing(trajeto: TrajetoSalvo) {
  return useQuery({
    queryKey: queryKeys.briefing(trajeto.id, trajeto.atualizadoEm),
    queryFn: ({ signal }) => api.briefing(montarBriefingRequest(trajeto), signal),
    enabled: false,
  }).data;
}

/**
 * Briefing mais recente (por geradoEm) entre TODOS os trajetos, direto do cache
 * (memória ou persister), sem disparar requisição — a aba Alertas destaca os
 * cartões dos motivos ativos. Reage a atualizações do cache.
 */
export function useBriefingMaisRecente(): BriefingResponse | undefined {
  const qc = useQueryClient();
  return useSyncExternalStore(
    (onChange) => qc.getQueryCache().subscribe(onChange),
    () => {
      let melhor: BriefingResponse | undefined;
      for (const q of qc.getQueryCache().findAll({ queryKey: [CHAVE_BRIEFING] })) {
        const dados = q.state.data as BriefingResponse | undefined;
        if (dados && (!melhor || Date.parse(dados.geradoEm) > Date.parse(melhor.geradoEm))) {
          melhor = dados;
        }
      }
      return melhor;
    }
  );
}
