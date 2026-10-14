// Aba Alertas: atalhos de emergência abrem o discador com o número (item 4 de 13/10/2026).
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SnackbarProvider } from '@/components/snackbar';
import { ContatosEmergencia } from '@/features/alertas/contatos-emergencia';

const METRICAS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

describe('ContatosEmergencia', () => {
  // O Linking do jest-expo já é mock: limpa as chamadas entre os testes.
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it('mostra Defesa Civil 199 e Bombeiros 193 com rótulo acessível completo', async () => {
    await render(<ContatosEmergencia />);
    expect(screen.getByText('199')).toBeTruthy();
    expect(screen.getByText('Defesa Civil')).toBeTruthy();
    expect(screen.getByText('193')).toBeTruthy();
    expect(screen.getByText('Bombeiros')).toBeTruthy();
    expect(screen.getByLabelText('Ligar para a Defesa Civil, 199 — abre o discador')).toBeTruthy();
    expect(screen.getByLabelText('Ligar para os Bombeiros, 193 — abre o discador')).toBeTruthy();
  });

  it.each([
    ['Defesa Civil', '199', 'a'],
    ['Bombeiros', '193', 'os'],
  ])('toque em %s abre tel:%s', async (nome, numero, artigo) => {
    const abrir = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await render(<ContatosEmergencia />);
    await fireEvent.press(screen.getByLabelText(`Ligar para ${artigo} ${nome}, ${numero} — abre o discador`));
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(abrir).toHaveBeenCalledWith(`tel:${numero}`);
  });

  it('sem discador: snackbar com o número para ligar à mão', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('sem discador'));
    await render(
      <SafeAreaProvider initialMetrics={METRICAS}>
        <SnackbarProvider>
          <ContatosEmergencia />
        </SnackbarProvider>
      </SafeAreaProvider>
    );
    await fireEvent.press(screen.getByLabelText('Ligar para os Bombeiros, 193 — abre o discador'));
    expect(
      await screen.findByText('Não deu para abrir o discador. Ligue 193 (Bombeiros) pelo telefone.')
    ).toBeTruthy();
  });

  it('toque duplo rápido abre o discador uma vez só', async () => {
    const abrir = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await render(<ContatosEmergencia />);
    const cartao = screen.getByLabelText('Ligar para a Defesa Civil, 199 — abre o discador');
    await fireEvent.press(cartao);
    await fireEvent.press(cartao);
    expect(abrir).toHaveBeenCalledTimes(1);
  });
});
