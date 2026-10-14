// Tela Registro de requisições (item 7): as duas pontas (aparelho e servidor), "Mostrar mais" e
// Limpar com Desfazer.
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import RegistroRequisicoesScreen from '@/app/registro-requisicoes';
import { lerRegistro, limparRegistro, registrar } from '@/shared/api/registro';

import { renderComQuery } from '../support/render-com-query';

const mockMostrar = jest.fn();
jest.mock('@/components/snackbar', () => ({ useSnackbar: () => ({ mostrar: mockMostrar, ocultar: jest.fn() }) }));
jest.mock('@/components/stack-screen', () => ({
  StackScreen: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
const mockProviders = jest.fn();
jest.mock('@/shared/api/client', () => ({ api: { providers: () => mockProviders() } }));

const entrada = (i: number) => ({
  em: Date.parse('2026-10-13T12:00:00Z') + i * 1000,
  metodo: 'GET' as const,
  rota: '/v1/health',
  status: 200,
  erro: null,
  latenciaMs: 40 + i,
  bytes: 50,
  degradadas: null,
});

describe('tela Registro de requisições', () => {
  beforeEach(() => {
    limparRegistro();
    mockMostrar.mockClear();
    mockProviders.mockResolvedValue({
      providers: [
        { name: 'open-meteo', status: 'ok', latencyMs: 300, lastSuccessAt: null, requestCount: 10, successCount: 8, avgLatencyMs: 410 },
      ],
    });
  });

  it('vazio: explica e não mostra Limpar', async () => {
    await renderComQuery(<RegistroRequisicoesScreen />);
    expect(screen.getByText(/Nenhuma requisição desde que o app abriu/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Limpar' })).toBeNull();
    expect(await screen.findByText('8/10 ok (80%)')).toBeTruthy();
    expect(screen.getByText('média 410 ms')).toBeTruthy();
  });

  it('mostra 10 por vez, totais por rota e Limpar com Desfazer', async () => {
    for (let i = 0; i < 12; i++) registrar(entrada(i));
    registrar({ ...entrada(12), rota: '/v1/briefings', metodo: 'POST', status: null, erro: 'tempo-esgotado', bytes: null, latenciaMs: 8000 });
    await renderComQuery(<RegistroRequisicoesScreen />);
    expect(screen.getByText('12/13 ok (92%)')).toBeTruthy();
    expect(screen.getByText('POST /v1/briefings · tempo esgotado')).toBeTruthy();
    expect(screen.getAllByText(/^GET \/v1\/health · HTTP 200$/)).toHaveLength(9);

    await fireEvent.press(screen.getByRole('button', { name: 'Mostrar mais' }));
    expect(screen.getAllByText(/^GET \/v1\/health · HTTP 200$/)).toHaveLength(12);

    await fireEvent.press(screen.getByRole('button', { name: 'Limpar' }));
    expect(lerRegistro()).toHaveLength(0);
    const { acao } = mockMostrar.mock.calls[0][0];
    await act(() => acao.onPress());
    expect(lerRegistro()).toHaveLength(13);
  });
});
