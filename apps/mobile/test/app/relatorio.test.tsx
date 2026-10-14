// Tela Relatório do sistema (RF26): carregando, conteúdo, vazio, erro com "Tentar de novo" e troca de período.
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import RelatorioScreen from '@/app/relatorio';
import { ApiError } from '@/shared/api/errors';

import { renderComQuery } from '../support/render-com-query';
import { RELATORIO_EXEMPLO, RELATORIO_VAZIO } from '../support/relatorio';

jest.mock('@/components/stack-screen', () => ({
  StackScreen: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
const mockBuscar = jest.fn();
jest.mock('@/shared/api/relatorio', () => ({
  chaveRelatorio: (d: number) => ['relatorio', d],
  buscarRelatorio: (d: number) => mockBuscar(d),
}));

describe('tela Relatório do sistema', () => {
  beforeEach(() => mockBuscar.mockReset());

  it('esqueleto enquanto carrega, depois totais, vereditos, disponibilidade e latência', async () => {
    let responder: (v: unknown) => void = () => {};
    mockBuscar.mockReturnValue(new Promise((r) => (responder = r)));
    await renderComQuery(<RelatorioScreen />);
    expect(screen.getByLabelText('Carregando o relatório')).toBeTruthy();
    await act(async () => responder(RELATORIO_EXEMPLO));
    expect(await screen.findByLabelText('Briefings: 9')).toBeTruthy();
    expect(screen.getByLabelText('Trajetos distintos: 2')).toBeTruthy();
    expect(screen.getByLabelText('12/10: 3 Favorável, 1 Atenção')).toBeTruthy();
    expect(screen.getByText('75%')).toBeTruthy();
    expect(screen.getByLabelText('p95: 2400 ms')).toBeTruthy();
    expect(mockBuscar).toHaveBeenCalledWith(7);
  });

  it('troca para 30 dias', async () => {
    mockBuscar.mockResolvedValue(RELATORIO_EXEMPLO);
    await renderComQuery(<RelatorioScreen />);
    await screen.findByLabelText('Briefings: 9');
    await fireEvent.press(screen.getByRole('radio', { name: 'Últimos 30 dias' }));
    expect(mockBuscar).toHaveBeenLastCalledWith(30);
    expect(await screen.findByLabelText('Briefings: 9')).toBeTruthy();
  });

  it('vazio: "Nenhum briefing no período"', async () => {
    mockBuscar.mockResolvedValue(RELATORIO_VAZIO);
    await renderComQuery(<RelatorioScreen />);
    expect(await screen.findByText('Nenhum briefing no período')).toBeTruthy();
  });

  it('erro: mostra a causa e "Tentar de novo" busca outra vez', async () => {
    mockBuscar.mockRejectedValueOnce(new ApiError('tempo-esgotado', 'O servidor do Καιρός não respondeu em 8 s.'));
    mockBuscar.mockResolvedValueOnce(RELATORIO_EXEMPLO);
    await renderComQuery(<RelatorioScreen />);
    expect(await screen.findByText('O servidor do Καιρός não respondeu em 8 s.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByLabelText('Briefings: 9')).toBeTruthy();
  });
});
