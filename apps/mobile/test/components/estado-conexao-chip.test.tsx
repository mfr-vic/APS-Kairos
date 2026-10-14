// Chip de estado: derivação pura (rede + saúde real dos dados) e o componente reagindo ao
// onlineManager e ao cache. Regressão (13/10): "Online" com clima e ar indisponíveis.
import { onlineManager, QueryClient } from '@tanstack/react-query';
import { act, screen } from '@testing-library/react-native';

import {
  ehDemo,
  EstadoConexaoChip,
  estadoConexao,
  saudeDosDados,
} from '@/components/estado-conexao-chip';
import { FIXTURES_BRIEFING } from '@/features/briefing/fixtures';
import { queryKeys } from '@/shared/api/query-keys';

import { renderComQuery } from '../support/render-com-query';

const favoravel = FIXTURES_BRIEFING[0].briefing;
const indeterminado = FIXTURES_BRIEFING.find((f) => f.briefing.veredito === 'INDETERMINADO')!.briefing;

describe('estadoConexao', () => {
  it.each([
    [{ online: true, atualizando: false, temDados: false, demo: false }, 'online'],
    [{ online: true, atualizando: true, temDados: true, demo: false }, 'atualizando'],
    [{ online: false, atualizando: false, temDados: true, demo: false }, 'offline'],
    [{ online: false, atualizando: true, temDados: false, demo: false }, 'semDados'],
    [{ online: false, atualizando: false, temDados: true, demo: true }, 'demo'],
    [{ online: true, atualizando: false, temDados: true, demo: false, saude: 'parcial' as const }, 'parcial'],
    [{ online: true, atualizando: false, temDados: true, demo: false, saude: 'semServidor' as const }, 'semServidor'],
    // Offline vence a saúde: sem rede, o que importa é que os dados são os salvos.
    [{ online: false, atualizando: false, temDados: true, demo: false, saude: 'parcial' as const }, 'offline'],
  ])('%j → %s', (entradas, esperado) => {
    expect(estadoConexao(entradas)).toBe(esperado);
  });
});

describe('saudeDosDados', () => {
  it('briefing com dimensão indisponível → parcial; tudo fresh → ok; erro na última tentativa → semServidor', () => {
    expect(saudeDosDados({ briefing: favoravel, tempo: undefined, houveErro: false })).toBe('ok');
    expect(saudeDosDados({ briefing: indeterminado, tempo: undefined, houveErro: false })).toBe('parcial');
    expect(saudeDosDados({ briefing: favoravel, tempo: undefined, houveErro: true })).toBe('semServidor');
    const tempoFora = { ...indeterminado.observacoes[0] };
    expect(saudeDosDados({ briefing: undefined, tempo: tempoFora, houveErro: false })).toBe('parcial');
  });
});

describe('ehDemo', () => {
  it('detecta pela atribuição "Dados simulados" ou pelo source "simulado:"', () => {
    expect(ehDemo(undefined)).toBe(false);
    expect(ehDemo(favoravel)).toBe(false);
    expect(ehDemo({ ...favoravel, atribuicoes: ['Dados simulados (modo demonstração)'] })).toBe(true);
    const obs = { ...favoravel.observacoes[0], source: 'simulado:open-meteo' };
    expect(ehDemo({ ...favoravel, observacoes: [obs] })).toBe(true);
  });
});

describe('EstadoConexaoChip', () => {
  afterEach(() => act(() => onlineManager.setOnline(true)));

  it('online com briefing completo → "Online"; offline → "Offline · salvos"', async () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.briefing('t1', 'v1'), favoravel);
    await renderComQuery(<EstadoConexaoChip />, client);
    expect(screen.getByText('Online')).toBeTruthy();
    await act(() => onlineManager.setOnline(false));
    expect(screen.getByText('Offline · salvos')).toBeTruthy();
    expect(
      screen.getByLabelText('Estado da conexão: Offline: mostrando os últimos dados salvos')
    ).toBeTruthy();
  });

  it('online com briefing de fontes indisponíveis → "Dados parciais" (não "Online")', async () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.briefing('t1', 'v1'), indeterminado);
    await renderComQuery(<EstadoConexaoChip />, client);
    expect(screen.getByText('Dados parciais')).toBeTruthy();
    expect(screen.queryByText('Online')).toBeNull();
  });

  it('offline sem nada em cache → "Sem conexão"', async () => {
    await act(() => onlineManager.setOnline(false));
    await renderComQuery(<EstadoConexaoChip />);
    expect(screen.getByText('Sem conexão')).toBeTruthy();
  });
});
