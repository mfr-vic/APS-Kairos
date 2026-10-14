// Abrir o briefing de um trajeto = UM uso para a hierarquia da lista (item 2 de 13/10).
// Trajeto inexistente não registra nada; re-render não registra de novo.
import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import BriefingRoute from '@/app/trajetos/[id]/briefing';

const mockRegistrar = jest.fn();
let mockTrajeto: { data: unknown; isPending: boolean } = { data: undefined, isPending: false };

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ id: 't1' }),
}));
jest.mock('@/components/stack-screen', () => ({
  StackScreen: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
jest.mock('@/features/trajetos/use-trajetos', () => ({
  useTrajeto: () => mockTrajeto,
  useRegistrarUso: () => ({ mutate: mockRegistrar }),
}));
jest.mock('@/features/briefing/use-briefing', () => ({
  useBriefing: () => ({
    data: undefined,
    error: null,
    fetchStatus: 'fetching',
    isFetching: true,
    refetch: jest.fn(),
  }),
}));

const salvo = {
  id: 't1',
  nome: 'Casa → Trabalho',
  criadoEm: '2026-10-10T08:00:00-03:00',
  atualizadoEm: '2026-10-10T08:00:00-03:00',
  trajeto: {
    origem: { lat: -23.56, lon: -46.65, rotulo: 'A' },
    destino: { lat: -23.55, lon: -46.63, rotulo: 'B' },
    onibus: [],
    trilhos: [],
  },
};

describe('rota trajetos/[id]/briefing: registro de uso', () => {
  beforeEach(() => mockRegistrar.mockClear());

  it('registra um uso ao abrir um trajeto que existe, e só um em re-renders', async () => {
    mockTrajeto = { data: salvo, isPending: false };
    const r = await render(<BriefingRoute />);
    expect(mockRegistrar).toHaveBeenCalledTimes(1);
    expect(mockRegistrar).toHaveBeenCalledWith('t1');
    await r.rerender(<BriefingRoute />);
    expect(mockRegistrar).toHaveBeenCalledTimes(1);
  });

  it('trajeto excluído ou ainda lendo: não registra', async () => {
    mockTrajeto = { data: undefined, isPending: true };
    await render(<BriefingRoute />);
    mockTrajeto = { data: null, isPending: false };
    await render(<BriefingRoute />);
    expect(mockRegistrar).not.toHaveBeenCalled();
  });
});
