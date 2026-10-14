// Regressão do item 1 de 13/10/2026: tocar no título "Trajetos · MASP → Sé ▾" congelava o app no
// Android (folha formSheet). Roda o _layout REAL com expo-router/testing-library e confere:
//  - toques repetidos no título não empilham duas folhas (dangerouslySingular + useNavegacao);
//  - escolher um trajeto fecha a folha UMA vez e troca o principal;
//  - "Novo trajeto" troca a folha pela tela de cadastro numa única navegação (sem back+push).
// Que o Android não usa formSheet está em test/shared/navegacao/apresentacao.test.ts (o Jest
// roda como iOS; a folha nativa em si só se confere no aparelho).
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Pressable, Text } from 'react-native';
import { router, Slot } from 'expo-router';

import RootLayout from '@/app/_layout';
import SeletorTrajetoScreen from '@/app/seletor-trajeto';
import type { TrajetoSalvo } from '@/features/trajetos/storage';
import { liberarNavegacao, useNavegacao } from '@/shared/navegacao/use-navegacao';

// expo-router/testing-library troca a reanimated pelo mock oficial, que não tem useReducedMotion
// (usado pelo _layout); o mock é um objeto comum, então completamos aqui (movimento normal).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const reanimatedMock = require('react-native-reanimated') as { useReducedMotion?: () => boolean };
reanimatedMock.useReducedMotion ??= () => false;

const tr = (id: string, nome: string, principal = false): TrajetoSalvo => ({
  id,
  nome,
  principal,
  criadoEm: '2026-10-10T08:00:00-03:00',
  atualizadoEm: '2026-10-10T08:00:00-03:00',
  trajeto: {
    origem: { lat: -23.561, lon: -46.655, rotulo: 'MASP' },
    destino: { lat: -23.55, lon: -46.633, rotulo: 'Sé' },
    onibus: [],
    trilhos: [],
  },
});

const mockLista = [tr('a', 'MASP → Sé', true), tr('b', 'Pinheiros → Luz')];
const mockTornarPrincipal = jest.fn();

jest.mock('@/features/trajetos/use-trajetos', () => ({
  useTrajetos: () => ({ data: mockLista }),
}));
// O _layout real liga o expo-network ao onlineManager; no Jest a assinatura nativa não existe.
jest.mock('expo-network', () => ({
  addNetworkStateListener: () => ({ remove: () => {} }),
}));
jest.mock('@/features/trajetos/use-acoes-trajeto', () => ({
  useAcoesTrajeto: () => ({ tornarPrincipal: mockTornarPrincipal }),
}));

/** Aba falsa com o mesmo gatilho do cabeçalho da aba Trajetos. */
function AbaFalsa() {
  const nav = useNavegacao();
  return (
    <Pressable accessibilityRole="button" onPress={() => nav.empurrar('/seletor-trajeto')}>
      <Text>Trajetos · MASP → Sé ▾</Text>
    </Pressable>
  );
}

const rotas = {
  _layout: RootLayout,
  '(tabs)/_layout': Slot,
  '(tabs)/index': AbaFalsa,
  'seletor-trajeto': SeletorTrajetoScreen,
  'trajetos/novo': () => <Text>Tela de cadastro</Text>,
  // Demais rotas declaradas no _layout (stubs, só para o Stack não acusar rota ausente).
  'trajetos/[id]/editar': () => null,
  'trajetos/[id]/briefing': () => null,
  'trajetos/[id]/acoes': () => null,
  provedores: () => null,
  'registro-requisicoes': () => null,
  'como-funciona': () => null,
  'exemplos-briefing': () => null,
};

/** Nomes das rotas do Stack raiz (o estado de topo é o `__root` do expo-router). */
const rotasNaPilha = (estado: any): string[] => {
  const pilha = estado.routes[0]?.name === '__root' ? estado.routes[0].state : estado;
  return pilha.routes.map((r: any) => r.name);
};

describe('rota seletor-trajeto (folha "Trajeto em destaque")', () => {
  beforeEach(() => {
    liberarNavegacao();
    mockTornarPrincipal.mockClear();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  });
  afterEach(() => jest.useRealTimers());

  it('3 toques rápidos no título abrem UMA folha; escolher outro trajeto fecha uma vez e troca o principal', async () => {
    const r = renderRouter(rotas, { initialUrl: '/' });
    await r; // RNTL 14: render assíncrono; getPathname etc. ficam no objeto devolvido
    const titulo = screen.getByRole('button', { name: 'Trajetos · MASP → Sé ▾' });
    await fireEvent.press(titulo);
    await fireEvent.press(titulo);
    await fireEvent.press(titulo);
    expect(r.getPathname()).toBe('/seletor-trajeto');
    expect(rotasNaPilha(r.getRouterState()).filter((n) => n === 'seletor-trajeto')).toHaveLength(1);

    // Mesmo um push direto (sem a trava do hook) não duplica: a rota é dangerouslySingular.
    await act(() => router.push('/seletor-trajeto'));
    expect(rotasNaPilha(r.getRouterState()).filter((n) => n === 'seletor-trajeto')).toHaveLength(1);

    await act(() => jest.advanceTimersByTime(1000));
    const outro = screen.getByRole('button', { name: /^Pinheiros → Luz/ });
    await fireEvent.press(outro);
    await fireEvent.press(outro); // 2º toque durante a transição: não volta duas telas
    expect(r.getPathname()).toBe('/');
    expect(rotasNaPilha(r.getRouterState())).toEqual(['(tabs)']);
    expect(mockTornarPrincipal).toHaveBeenCalledTimes(1);
    expect(mockTornarPrincipal).toHaveBeenCalledWith(mockLista[1]);
  });

  it('escolher o trajeto que já é o principal só fecha a folha', async () => {
    const r = renderRouter(rotas, { initialUrl: '/' });
    await r; // RNTL 14: render assíncrono; getPathname etc. ficam no objeto devolvido
    await act(() => router.push('/seletor-trajeto'));
    await fireEvent.press(screen.getByRole('button', { name: /^MASP → Sé, de MASP a Sé/ }));
    expect(r.getPathname()).toBe('/');
    expect(mockTornarPrincipal).not.toHaveBeenCalled();
  });

  it('"Novo trajeto" troca a folha pelo cadastro: voltar dali retorna às abas, não à folha', async () => {
    const r = renderRouter(rotas, { initialUrl: '/' });
    await r; // RNTL 14: render assíncrono; getPathname etc. ficam no objeto devolvido
    await act(() => router.push('/seletor-trajeto'));
    await fireEvent.press(screen.getByRole('button', { name: 'Novo trajeto' }));
    expect(r.getPathname()).toBe('/trajetos/novo');
    expect(rotasNaPilha(r.getRouterState())).toEqual(['(tabs)', 'trajetos/novo']);
    expect(screen.getByText('Tela de cadastro')).toBeTruthy();
  });
});
