// T29 / RF01 / TC01 / TC02: busca de endereço e GPS, sem rede (API e expo-location simulados).
import { fireEvent, screen } from '@testing-library/react-native';
import { onlineManager } from '@tanstack/react-query';

import { AddressSearch } from '@/features/trajetos/address-search';
import { obterLocalizacao } from '@/features/trajetos/obter-localizacao';
import { api } from '@/shared/api/client';
import { ApiError } from '@/shared/api/errors';

import { renderComQuery } from '../../support/render-com-query';

jest.mock('@/shared/api/client', () => ({ api: { geocode: jest.fn() } }));
jest.mock('@/features/trajetos/obter-localizacao', () => ({ obterLocalizacao: jest.fn() }));

const geocode = api.geocode as jest.Mock;
const gps = obterLocalizacao as jest.Mock;

async function buscar(texto: string) {
  await fireEvent.changeText(screen.getByLabelText('Buscar endereço da origem'), texto);
  await fireEvent.press(screen.getByText('Buscar endereço'));
}

describe('AddressSearch', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => onlineManager.setOnline(true));

  it('TC02: mostra os resultados e devolve as coordenadas escolhidas', async () => {
    geocode.mockResolvedValue({
      resultados: [
        { lat: -23.5649, lon: -46.6519, rotulo: 'Avenida Paulista, 1000, Bela Vista, São Paulo' },
      ],
    });
    const onEscolher = jest.fn();
    await renderComQuery(<AddressSearch doPonto="da origem" onEscolher={onEscolher} />);
    await buscar('  Av. Paulista, 1000 ');
    await fireEvent.press(await screen.findByLabelText(/^Escolher Avenida Paulista/));
    expect(geocode).toHaveBeenCalledWith('Av. Paulista, 1000', expect.anything());
    expect(onEscolher).toHaveBeenCalledWith({
      lat: -23.5649,
      lon: -46.6519,
      rotulo: 'Avenida Paulista, 1000, Bela Vista, São Paulo',
    });
  });

  it('nenhum resultado → mensagem de vazio', async () => {
    geocode.mockResolvedValue({ resultados: [] });
    await renderComQuery(<AddressSearch doPonto="da origem" onEscolher={jest.fn()} />);
    await buscar('Rua que não existe');
    expect(
      await screen.findByText('Nenhum endereço encontrado para “Rua que não existe”.')
    ).toBeTruthy();
  });

  it('503 do servidor → title do Problem Details', async () => {
    geocode.mockRejectedValue(
      new ApiError('http', 'Busca de endereço indisponível no momento', 503)
    );
    await renderComQuery(<AddressSearch doPonto="da origem" onEscolher={jest.fn()} />);
    await buscar('Av. Paulista');
    expect(await screen.findByText('Busca de endereço indisponível no momento')).toBeTruthy();
  });

  it('menos de 3 caracteres → não chama a API', async () => {
    await renderComQuery(<AddressSearch doPonto="da origem" onEscolher={jest.fn()} />);
    await buscar('Av');
    expect(await screen.findByText('Digite pelo menos 3 caracteres para buscar.')).toBeTruthy();
    expect(geocode).not.toHaveBeenCalled();
  });

  it('sem rede → mensagem clara, sem chamar a API', async () => {
    onlineManager.setOnline(false);
    await renderComQuery(<AddressSearch doPonto="da origem" onEscolher={jest.fn()} />);
    await buscar('Av. Paulista');
    expect(
      await screen.findByText(/^Sem conexão: a busca de endereço precisa de rede/)
    ).toBeTruthy();
    expect(geocode).not.toHaveBeenCalled();
  });

  it('TC01: GPS concedido → ponto "Minha localização"', async () => {
    gps.mockResolvedValue({ ok: true, ponto: { lat: -23.55, lon: -46.63 } });
    const onEscolher = jest.fn();
    await renderComQuery(
      <AddressSearch doPonto="da origem" comLocalizacao onEscolher={onEscolher} />
    );
    await fireEvent.press(screen.getByText('Usar minha localização'));
    expect(await screen.findByText('Escolhido: Minha localização')).toBeTruthy();
    expect(onEscolher).toHaveBeenCalledWith({
      lat: -23.55,
      lon: -46.63,
      rotulo: 'Minha localização',
    });
  });

  it('GPS negado → mensagem e nada é escolhido', async () => {
    gps.mockResolvedValue({ ok: false, mensagem: 'Permissão de localização negada.' });
    const onEscolher = jest.fn();
    await renderComQuery(
      <AddressSearch doPonto="da origem" comLocalizacao onEscolher={onEscolher} />
    );
    await fireEvent.press(screen.getByText('Usar minha localização'));
    expect(await screen.findByText('Permissão de localização negada.')).toBeTruthy();
    expect(onEscolher).not.toHaveBeenCalled();
    expect(screen.getByText('Usar minha localização')).toBeTruthy(); // botão volta a ficar disponível
  });
});
