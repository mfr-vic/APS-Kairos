// T29 / RF01 / TC01: permissão de localização concedida, negada, erro do GPS e prazo.
import * as Location from 'expo-location';

import { obterLocalizacao } from '@/features/trajetos/obter-localizacao';

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));

const permissao = Location.requestForegroundPermissionsAsync as jest.Mock;
const posicao = Location.getCurrentPositionAsync as jest.Mock;

describe('obterLocalizacao', () => {
  beforeEach(() => jest.clearAllMocks());

  it('concedida → coordenadas validadas pelo contrato', async () => {
    permissao.mockResolvedValue({ status: 'granted' });
    posicao.mockResolvedValue({ coords: { latitude: -23.5614961, longitude: -46.6559677 } });
    expect(await obterLocalizacao()).toEqual({
      ok: true,
      ponto: { lat: -23.5614961, lon: -46.6559677 },
    });
  });

  it('negada → mensagem pt-BR, sem ler o GPS', async () => {
    permissao.mockResolvedValue({ status: 'denied' });
    const r = await obterLocalizacao();
    expect(r).toEqual({
      ok: false,
      mensagem: expect.stringMatching(/^Permissão de localização negada/),
    });
    expect(posicao).not.toHaveBeenCalled();
  });

  it('GPS desligado (exceção) → mensagem', async () => {
    permissao.mockResolvedValue({ status: 'granted' });
    posicao.mockRejectedValue(new Error('Location services are disabled'));
    expect(await obterLocalizacao()).toEqual({
      ok: false,
      mensagem: expect.stringMatching(/GPS está ligado/),
    });
  });

  it('GPS sem resposta → desiste no prazo', async () => {
    permissao.mockResolvedValue({ status: 'granted' });
    posicao.mockReturnValue(new Promise(() => {}));
    expect(await obterLocalizacao(10)).toMatchObject({ ok: false });
  });

  it('coordenada fora da faixa → recusada', async () => {
    permissao.mockResolvedValue({ status: 'granted' });
    posicao.mockResolvedValue({ coords: { latitude: 200, longitude: 0 } });
    expect(await obterLocalizacao()).toEqual({
      ok: false,
      mensagem: 'O aparelho devolveu coordenadas inválidas.',
    });
  });
});
