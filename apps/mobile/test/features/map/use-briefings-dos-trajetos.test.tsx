// Briefings em cache por trajeto para o mapa: lê o cache e nunca chama a API.
import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { FIXTURES_BRIEFING } from '@/features/briefing/fixtures';
import { useBriefingsDosTrajetos } from '@/features/map/use-briefings-dos-trajetos';
import type { TrajetoSalvo } from '@/features/trajetos/storage';
import { api } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';

import { novoQueryClient } from '../../support/render-com-query';

jest.mock('@/shared/api/client', () => ({ api: { briefing: jest.fn() } }));

const trajeto = (id: string): TrajetoSalvo => ({
  id,
  nome: id,
  criadoEm: '2026-10-10T08:00:00-03:00',
  atualizadoEm: '2026-10-10T08:00:00-03:00',
  trajeto: {
    origem: { lat: -23.56, lon: -46.65, rotulo: 'A' },
    destino: { lat: -23.55, lon: -46.63, rotulo: 'B' },
    onibus: [],
    trilhos: [],
  },
});

describe('useBriefingsDosTrajetos', () => {
  it('mapeia id → briefing em cache (undefined sem cache) sem requisição', async () => {
    const client = novoQueryClient();
    const [a, b] = [trajeto('a'), trajeto('b')];
    const briefing = FIXTURES_BRIEFING[0].briefing;
    client.setQueryData(queryKeys.briefing(a.id, a.atualizadoEm), briefing);
    const { result } = await renderHook(() => useBriefingsDosTrajetos([a, b]), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    expect(result.current).toEqual({ a: briefing, b: undefined });
    expect(api.briefing).not.toHaveBeenCalled();
  });
});
