// Rota do itinerário: linha inválida / sem dados e trajeto inexistente viram estado, não erro.
import { render, screen } from '@testing-library/react-native';

import ItinerarioRoute from '@/app/trajetos/[id]/itinerario/[linha]';

let mockParams = { id: 't1', linha: 'L2' };
let mockTrajeto: { data: unknown; isPending: boolean } = { data: undefined, isPending: false };

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/features/trajetos/use-trajetos', () => ({ useTrajeto: () => mockTrajeto }));
jest.mock('@/features/briefing/use-briefing', () => ({ useUltimoBriefing: () => undefined }));

const salvo = {
  id: 't1',
  nome: 'Casa → Trabalho',
  criadoEm: '2026-10-10T08:00:00-03:00',
  atualizadoEm: '2026-10-10T08:00:00-03:00',
  trajeto: {
    origem: { lat: -23.546, lon: -46.691, rotulo: 'A' },
    destino: { lat: -23.576, lon: -46.641, rotulo: 'B' },
    onibus: [],
    trilhos: ['L2'],
  },
};

describe('rota trajetos/[id]/itinerario/[linha]', () => {
  it('mostra o itinerário da linha do trajeto', async () => {
    mockParams = { id: 't1', linha: 'L2' };
    mockTrajeto = { data: salvo, isPending: false };
    await render(<ItinerarioRoute />);
    expect(screen.getByTestId('itinerario-sentido')).toBeTruthy();
  });

  it('linha sem itinerário (CPTM) ou inválida: estado "indisponível"', async () => {
    mockTrajeto = { data: salvo, isPending: false };
    for (const linha of ['L11', 'X9']) {
      mockParams = { id: 't1', linha };
      await render(<ItinerarioRoute />);
      expect(screen.getByText('Itinerário indisponível')).toBeTruthy();
    }
  });

  it('trajeto excluído: estado de não encontrado', async () => {
    mockParams = { id: 't1', linha: 'L2' };
    mockTrajeto = { data: null, isPending: false };
    await render(<ItinerarioRoute />);
    expect(screen.queryByTestId('itinerario-sentido')).toBeNull();
  });
});
