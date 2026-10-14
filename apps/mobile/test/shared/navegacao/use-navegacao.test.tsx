// Item 8 (13/10/2026): vários toques no mesmo botão abriam várias telas. useNavegacao navega
// uma vez por transição e avisa "Abrindo…" (uma vez) se o usuário insistir.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SnackbarProvider } from '@/components/snackbar';
import {
  AVISO_ABRINDO,
  chaveDoHref,
  JANELA_NAVEGACAO_MS,
  liberarNavegacao,
  reservarNavegacao,
  useNavegacao,
} from '@/shared/navegacao/use-navegacao';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
}));

const METRICAS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

beforeEach(() => {
  liberarNavegacao();
  jest.clearAllMocks();
});

describe('chaveDoHref', () => {
  it('resolve [id] e ordena os demais parâmetros', () => {
    expect(chaveDoHref('/provedores')).toBe('/provedores');
    expect(chaveDoHref({ pathname: '/trajetos/[id]/briefing', params: { id: 't1' } })).toBe(
      '/trajetos/t1/briefing'
    );
    expect(chaveDoHref({ pathname: '/trajetos/[id]/editar', params: { id: 't1', z: 1, a: 'b' } })).toBe(
      '/trajetos/t1/editar?a=b&z=1'
    );
  });
});

describe('reservarNavegacao', () => {
  it('repetida/ocupada dentro da janela; livre depois dela', () => {
    expect(reservarNavegacao('/a', 0)).toBe('ok');
    expect(reservarNavegacao('/a', 100)).toBe('repetida');
    expect(reservarNavegacao('/b', 100)).toBe('ocupada');
    expect(reservarNavegacao('/a', JANELA_NAVEGACAO_MS)).toBe('ok');
  });
});

function Botoes() {
  const nav = useNavegacao();
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => nav.empurrar('/provedores')}>
        <Text>Estado das fontes</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => nav.empurrar({ pathname: '/trajetos/[id]/briefing', params: { id: 't1' } })}
      >
        <Text>Briefing</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => nav.voltar()}>
        <Text>Fechar</Text>
      </Pressable>
    </>
  );
}

describe('useNavegacao', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('3 toques no mesmo botão empilham UMA tela e avisam "Abrindo…" uma única vez', async () => {
    await render(
      <SafeAreaProvider initialMetrics={METRICAS}>
        <SnackbarProvider>
          <Botoes />
        </SnackbarProvider>
      </SafeAreaProvider>
    );
    const botao = screen.getByRole('button', { name: 'Estado das fontes' });
    await fireEvent.press(botao);
    await fireEvent.press(botao);
    await fireEvent.press(botao);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/provedores');
    expect(screen.getAllByText(AVISO_ABRINDO)).toHaveLength(1);
  });

  it('outro destino durante a transição também espera; depois da janela navega', async () => {
    await render(<Botoes />);
    await fireEvent.press(screen.getByRole('button', { name: 'Estado das fontes' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Briefing' }));
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(AVISO_ABRINDO)).toBeNull(); // sem provider: nunca quebra
    await act(() => jest.advanceTimersByTime(JANELA_NAVEGACAO_MS));
    await fireEvent.press(screen.getByRole('button', { name: 'Briefing' }));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/trajetos/[id]/briefing',
      params: { id: 't1' },
    });
  });

  it('dois toques em "Fechar" desempilham UMA tela', async () => {
    await render(<Botoes />);
    const fechar = screen.getByRole('button', { name: 'Fechar' });
    await fireEvent.press(fechar);
    await fireEvent.press(fechar);
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});
