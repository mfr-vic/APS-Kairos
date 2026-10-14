// Botão "Compartilhar": abre o Share nativo com o texto do briefing.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Share } from 'react-native';

import { JANELA_TOQUE_MS } from '@/components/use-toque-protegido';
import { BotaoCompartilhar } from '@/features/briefing/botao-compartilhar';
import { FIXTURES_BRIEFING } from '@/features/briefing/fixtures';
import { textoParaCompartilhar } from '@/features/briefing/texto-para-compartilhar';

describe('BotaoCompartilhar', () => {
  it('chama Share.share com título e texto do briefing', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    const briefing = FIXTURES_BRIEFING[0].briefing;
    await render(<BotaoCompartilhar nomeTrajeto="Casa" briefing={briefing} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Compartilhar briefing' }));
    expect(share).toHaveBeenCalledWith({
      title: 'Καιρός · Casa',
      message: textoParaCompartilhar('Casa', briefing),
    });
  });

  it('enviado → snackbar "Briefing enviado"; falha → snackbar com a causa', async () => {
    const mostrar = jest.fn();
    jest.spyOn(require('@/components/snackbar'), 'useSnackbar').mockReturnValue({ mostrar, ocultar: jest.fn() });
    jest.spyOn(Share, 'share').mockResolvedValueOnce({ action: 'sharedAction' });
    await render(<BotaoCompartilhar nomeTrajeto="Casa" briefing={FIXTURES_BRIEFING[0].briefing} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Compartilhar briefing' }));
    expect(mostrar).toHaveBeenCalledWith({ mensagem: 'Briefing enviado' });
    jest.spyOn(Share, 'share').mockRejectedValueOnce(new Error('sem suporte'));
    // O Botao ignora um 2º toque em até JANELA_TOQUE_MS (item 8): a 2ª tentativa vem depois dela.
    const depois = Date.now() + JANELA_TOQUE_MS + 1;
    const relogio = jest.spyOn(Date, 'now').mockReturnValue(depois);
    await fireEvent.press(screen.getByRole('button', { name: 'Compartilhar briefing' }));
    relogio.mockRestore();
    expect(mostrar).toHaveBeenLastCalledWith(expect.objectContaining({ tipo: 'erro' }));
  });
});
