// Aba Mapa (itens 5 e 6 de 13/10; 14/10): "Mostrar minha posição" voa até a pessoa e mostra as rotas
// (GET /v1/rota, nunca linha reta); as camadas ligadas viram pontos injetados; atalhos Uber/99.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import type { ReactNode } from 'react';

import MapaScreen from '@/app/(tabs)/mapa';
import type { MapWebViewNativoProps } from '@/features/map/map-web-view';
import type { TrajetoSalvo } from '@/features/trajetos/storage';
import { feedbackTatil } from '@/shared/feedback-tatil';

import { CAMADAS_EXEMPLO } from '../../support/camadas';
import { renderComQuery } from '../../support/render-com-query';

const mockMapa: { props: MapWebViewNativoProps | null } = { props: null };
const mockTrajeto: TrajetoSalvo = {
  id: 't1',
  nome: 'Casa → Trabalho',
  criadoEm: '2026-10-10T08:00:00-03:00',
  atualizadoEm: '2026-10-10T08:00:00-03:00',
  trajeto: {
    origem: { lat: -23.5505, lon: -46.6333, rotulo: 'Sé' },
    destino: { lat: -23.5614, lon: -46.6559, rotulo: 'MASP' },
    onibus: [],
    trilhos: [],
  },
};

jest.mock('@/components/screen', () => ({ Screen: ({ children }: { children?: ReactNode }) => <>{children}</> }));
jest.mock('@/features/map/map-web-view', () => ({
  MapWebView: (p: MapWebViewNativoProps) => {
    mockMapa.props = p;
    return null;
  },
}));
jest.mock('@/features/trajetos/use-trajetos', () => ({ useTrajetos: () => ({ data: [mockTrajeto] }) }));
jest.mock('@/features/map/use-briefings-dos-trajetos', () => ({ useBriefingsDosTrajetos: () => ({}) }));
jest.mock('@/shared/feedback-tatil', () => ({
  feedbackTatil: { sucesso: jest.fn(), erro: jest.fn(), selecao: jest.fn(), toque: jest.fn(), aviso: jest.fn() },
  vibrar: jest.fn(),
  marcaTatil: () => 0,
}));
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3, Highest: 5 },
  getForegroundPermissionsAsync: jest.fn(async () => ({ granted: false })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted', android: { accuracy: 'fine' } })),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: -23.5505, longitude: -46.6433, accuracy: 6 } })),
  getLastKnownPositionAsync: jest.fn(async () => null),
}));

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': status === 200 ? 'application/json' : 'application/problem+json' } });
const rota = (modo: 'a-pe' | 'carro') => ({
  modo,
  fonte: 'tomtom',
  distanciaM: modo === 'a-pe' ? 1200 : 3400,
  duracaoS: modo === 'a-pe' ? 900 : 660,
  atrasoTransitoS: modo === 'a-pe' ? null : 300,
  coordenadas: [
    [-46.6433, -23.5505],
    [-46.6333, -23.5505],
  ],
  observedAt: '2026-10-14T08:00:00-03:00',
});
const mockRota = { carroFalha: false };
const fetchMock = jest.fn(async (url: string) => {
  if (url.includes('/v1/rota') && url.includes('modo=a-pe')) return json(rota('a-pe'));
  if (url.includes('/v1/rota')) {
    return mockRota.carroFalha
      ? json({ type: 'about:blank', title: 'Sem rota', status: 503, detail: 'Nenhuma fonte de rota respondeu' }, 503)
      : json(rota('carro'));
  }
  return json(CAMADAS_EXEMPLO);
});
globalThis.fetch = fetchMock as unknown as typeof fetch;

describe('aba Mapa', () => {
  it('camadas padrão (alagamento + chuva) viram pontos no mapa', async () => {
    await renderComQuery(<MapaScreen />);
    await waitFor(() => expect(mockMapa.props?.pontosCamadas).toHaveLength(3)); // 1 alagamento + 2 chuva
    expect(fetchMock.mock.calls[0]).toBeDefined();
  });

  it('"Mostrar minha posição": precisão alta, háptica de sucesso, voo e as duas distâncias', async () => {
    await renderComQuery(<MapaScreen />);
    await screen.findByText(/ainda não tem permissão de localização/);
    expect(screen.queryByTestId('cartao-distancias')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Mostrar minha posição' }));

    await screen.findByTestId('cartao-distancias');
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: 5 });
    expect(feedbackTatil.sucesso).toHaveBeenCalled();
    expect(mockMapa.props).toMatchObject({ focoSeq: 1, localizacao: { lat: -23.5505, lon: -46.6433 } });
    expect(await screen.findByLabelText('Você → origem: 1,2 km, 15 min a pé')).toBeTruthy();
    expect(await screen.findByLabelText('Origem → destino · Casa → Trabalho: 3,4 km, 11 min de carro agora, +5 min de trânsito')).toBeTruthy();
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/v1/rota?de=-23.55050,-46.64330&para=-23.55050,-46.63330&modo=a-pe'))).toBe(true);
    await waitFor(() => expect(mockMapa.props?.rotasMapa?.aPe).toHaveLength(2));
    expect(screen.queryByText(/linha reta/i)).toBeNull();
  });

  it('regressão 14/10: sem rota de carro (503) mostra "Rota indisponível", nunca distância em linha reta', async () => {
    mockRota.carroFalha = true;
    await renderComQuery(<MapaScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Mostrar minha posição' }));
    expect(await screen.findByLabelText('Origem → destino · Casa → Trabalho: Rota indisponível agora; tente de novo')).toBeTruthy();
    expect(screen.queryByText(/linha reta/i)).toBeNull();
    mockRota.carroFalha = false;
  });

  it('filtro Trânsito liga os tiles do proxy da API (sem consultar camadas) e mostra a legenda da TomTom', async () => {
    await renderComQuery(<MapaScreen />);
    expect(mockMapa.props?.transitoUrl ?? null).toBeNull();
    await fireEvent.press(screen.getByTestId('filtro-transito'));
    await waitFor(() => expect(mockMapa.props?.transitoUrl).toMatch(/\/v1\/mapa\/transito\/\{z\}\/\{x\}\/\{y\}\.png$/));
    expect(screen.getByText(/verde = fluindo/)).toBeTruthy();
  });

  it('atalhos Uber e 99 (só texto) para o trajeto em destaque', async () => {
    await renderComQuery(<MapaScreen />);
    expect(screen.getByRole('button', { name: /^Abrir no Uber/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Abrir na 99/ })).toBeTruthy();
    expect(screen.getByText('Atalho: abre o app da empresa; o Καιρός não tem vínculo com ela.')).toBeTruthy();
  });
});
