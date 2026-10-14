// Rotas da aba Mapa (GET /v1/rota): você → origem a pé e origem → destino de carro, com cache TanStack.
// Só pede depois de a pessoa tocar em "Mostrar minha posição" (`ativo`). 503 = sem rota: sem nova tentativa
// automática (a pessoa tenta de novo pelo botão); o cartão mostra a mensagem honesta.
import type { LatLon, ModoRota } from '@kairos/contracts';
import { useQuery } from '@tanstack/react-query';

import { buscarRota, chaveRota } from '@/shared/api/rota';

/** A TomTom muda o trânsito em minutos; a rota a pé quase não muda. */
const FRESCOR_MS: Record<ModoRota, number> = { 'a-pe': 30 * 60_000, carro: 2 * 60_000 };

export function useRota(de: LatLon | null, para: LatLon | null, modo: ModoRota, ativo: boolean) {
  return useQuery({
    queryKey: de && para ? chaveRota(de, para, modo) : ['rota', modo, 'sem-pontos'],
    queryFn: ({ signal }) => buscarRota(de!, para!, modo, signal),
    enabled: ativo && !!de && !!para,
    staleTime: FRESCOR_MS[modo],
    retry: false,
  });
}
