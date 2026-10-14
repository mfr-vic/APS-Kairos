// "Ir de carro por aplicativo": dois botões só de texto, nota de atalho, Uber com origem e destino,
// 99 abrindo a loja e copiando o destino (snackbar avisa).
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { Linking } from 'react-native';

import { AtalhosCorrida, AVISO_COPIADO_99, NOTA_ATALHO } from '@/features/atalhos/atalhos-corrida';
import { link99, linkUber } from '@/features/atalhos/links-de-corrida';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

const ORIGEM = { lat: -23.5505, lon: -46.6333, rotulo: 'Praça da Sé' };
const DESTINO = { lat: -23.5614, lon: -46.6559, rotulo: 'Av. Paulista, 1578' };

describe('AtalhosCorrida', () => {
  const mostrar = jest.fn();
  beforeEach(() => {
    mostrar.mockClear();
    jest.spyOn(require('@/components/snackbar'), 'useSnackbar').mockReturnValue({ mostrar, ocultar: jest.fn() });
  });
  afterEach(() => jest.restoreAllMocks());

  it('dois botões de texto com rótulos completos e a nota de atalho', async () => {
    await render(<AtalhosCorrida origem={ORIGEM} destino={DESTINO} />);
    expect(screen.getByText('Ir de carro por aplicativo')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Abrir no Uber\. Atalho .*origem e o destino/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Abrir na 99\. Atalho .*endereço do destino é copiado/ })).toBeTruthy();
    expect(screen.getByText(NOTA_ATALHO)).toBeTruthy();
  });

  it('Uber: abre o link com origem e destino', async () => {
    const abrir = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await render(<AtalhosCorrida origem={ORIGEM} destino={DESTINO} />);
    await fireEvent.press(screen.getByRole('button', { name: /^Abrir no Uber/ }));
    expect(abrir).toHaveBeenCalledWith(linkUber(ORIGEM, DESTINO));
    expect(mostrar).not.toHaveBeenCalled();
  });

  it('99: copia o destino, avisa no snackbar e abre a página da 99', async () => {
    const abrir = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await render(<AtalhosCorrida origem={ORIGEM} destino={DESTINO} />);
    await fireEvent.press(screen.getByRole('button', { name: /^Abrir na 99/ }));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('Av. Paulista, 1578');
    expect(mostrar).toHaveBeenCalledWith({ tipo: 'info', mensagem: AVISO_COPIADO_99 });
    expect(abrir).toHaveBeenCalledWith(link99('ios'));
  });

  it('se o aparelho não abrir o link, avisa com snackbar de erro', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('sem app'));
    await render(<AtalhosCorrida origem={ORIGEM} destino={DESTINO} />);
    await fireEvent.press(screen.getByRole('button', { name: /^Abrir no Uber/ }));
    expect(mostrar).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'erro' }));
  });
});
