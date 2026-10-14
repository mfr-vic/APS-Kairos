// "Como o Καιρός funciona" (item 9): diagrama com o estado ao vivo de cada nó e os conceitos de SD.
import { fireEvent, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import ComoFuncionaScreen from '@/app/como-funciona';
import { limparRegistro, registrar } from '@/shared/api/registro';

import { renderComQuery } from '../support/render-com-query';

const mockEmpurrar = jest.fn();
jest.mock('@/shared/navegacao/use-navegacao', () => ({ useNavegacao: () => ({ empurrar: mockEmpurrar }) }));
jest.mock('@/components/stack-screen', () => ({
  StackScreen: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
jest.mock('@/shared/api/client', () => ({
  api: {
    health: async () => ({ status: 'up', timestamp: '2026-10-13T12:00:00-03:00' }),
    providers: async () => ({
      providers: [
        { name: 'open-meteo', status: 'ok', latencyMs: 312, lastSuccessAt: null, requestCount: 1, successCount: 1, avgLatencyMs: 312 },
        { name: 'sptrans-olhovivo', status: 'indisponivel', latencyMs: null, lastSuccessAt: null, requestCount: 3, successCount: 0, avgLatencyMs: null },
      ],
    }),
  },
}));

describe('tela Como o Καιρός funciona', () => {
  beforeEach(() => {
    limparRegistro();
    mockEmpurrar.mockClear();
  });

  it('mostra as 3 camadas com dados vivos e os conceitos com o arquivo de cada um', async () => {
    registrar({ em: 0, metodo: 'POST', rota: '/v1/briefings', status: 200, erro: null, latenciaMs: 1100, bytes: 1, degradadas: null });
    await renderComQuery(<ComoFuncionaScreen />);
    expect(screen.getByText('1 · Este celular')).toBeTruthy();
    expect(screen.getByText('1× · média 1100 ms')).toBeTruthy();
    expect(await screen.findByText('312 ms')).toBeTruthy(); // Open-Meteo, medido pelo servidor
    expect(screen.getByText('fora do ar')).toBeTruthy(); // SPTrans com breaker aberto
    expect(screen.getAllByText('ainda não consultada').length).toBeGreaterThan(0);
    expect(screen.getByText('Circuit breaker')).toBeTruthy();
    expect(screen.getByText('apps/api/src/infrastructure/circuit-breaker.ts')).toBeTruthy();
  });

  it('leva ao registro de requisições', async () => {
    await renderComQuery(<ComoFuncionaScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Ver o registro de requisições' }));
    expect(mockEmpurrar).toHaveBeenCalledWith('/registro-requisicoes');
  });
});
