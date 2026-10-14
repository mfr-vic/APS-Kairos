// Widget "tempo agora" (aba Trajetos): Observation de clima do GET /v1/weather.
// Ponto: localização atual se a permissão JÁ foi concedida (não pede de novo só
// para o widget), senão a origem do trajeto principal, senão o centro de São Paulo.
// `local` diz à tela de onde é a previsão (a pessoa precisa saber ONDE).
import type { LatLon } from '@kairos/contracts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { CENTRO_SP } from '@/features/map/html-do-mapa';
import { obterLocalizacaoSePermitida } from '@/features/trajetos/obter-localizacao';
import { trajetoPrincipal } from '@/features/trajetos/storage';
import { useTrajetos } from '@/features/trajetos/use-trajetos';
import { api } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';

export type LocalDoTempo = { tipo: 'gps' | 'origem' | 'centro'; rotulo: string };

export function useTempoAgora() {
  const { data: trajetos } = useTrajetos();
  // undefined = GPS ainda resolvendo (não consulta); null = sem permissão.
  const [gps, setGps] = useState<LatLon | null | undefined>(undefined);

  useEffect(() => {
    let ativo = true;
    obterLocalizacaoSePermitida().then((ponto) => {
      if (ativo) setGps(ponto);
    });
    return () => {
      ativo = false;
    };
  }, []);

  const principal = trajetos ? trajetoPrincipal(trajetos) : undefined;
  const ponto = gps ?? principal?.trajeto.origem ?? CENTRO_SP;
  const local: LocalDoTempo = gps
    ? { tipo: 'gps', rotulo: 'Na sua localização' }
    : principal
      ? { tipo: 'origem', rotulo: `Na origem de “${principal.nome}”` }
      : { tipo: 'centro', rotulo: 'No centro de São Paulo' };
  const lat = Number(ponto.lat.toFixed(3));
  const lon = Number(ponto.lon.toFixed(3));

  const consulta = useQuery({
    queryKey: queryKeys.tempoAgora(lat, lon),
    queryFn: ({ signal }) => api.tempoAgora(lat, lon, signal),
    enabled: gps !== undefined,
    staleTime: 5 * 60_000,
  });
  return Object.assign(consulta, { local });
}
