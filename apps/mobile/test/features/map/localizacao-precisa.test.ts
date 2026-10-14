// "Mostrar minha posição": precisão alta quando a pessoa concede a localização exata; aviso quando só a
// aproximada (Android 12+ "coarse", iOS 14+ "reduced"); negada e GPS falho com mensagem.
import * as Location from 'expo-location';

import { obterPosicaoPrecisa } from '@/features/map/localizacao-precisa';

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3, Highest: 5 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));

const permissao = Location.requestForegroundPermissionsAsync as jest.Mock;
const posicao = Location.getCurrentPositionAsync as jest.Mock;
const COORDS = { coords: { latitude: -23.5614961, longitude: -46.6559677, accuracy: 8 } };

describe('obterPosicaoPrecisa', () => {
  beforeEach(() => jest.clearAllMocks());

  it('localização exata → lê com Accuracy.Highest, sem aviso', async () => {
    permissao.mockResolvedValue({ granted: true, status: 'granted', android: { accuracy: 'fine' } });
    posicao.mockResolvedValue(COORDS);
    expect(await obterPosicaoPrecisa()).toEqual({
      ok: true,
      ponto: { lat: -23.5614961, lon: -46.6559677 },
      aproximada: false,
      precisaoM: 8,
    });
    expect(posicao).toHaveBeenCalledWith({ accuracy: 5 });
  });

  it.each([
    ['Android 12+ aproximada', { android: { accuracy: 'coarse' } }],
    ['iOS 14+ reduzida', { ios: { accuracy: 'reduced' } }],
  ])('%s → marca aproximada e lê com precisão equilibrada', async (_n, extra) => {
    permissao.mockResolvedValue({ granted: true, status: 'granted', ...extra });
    posicao.mockResolvedValue(COORDS);
    const r = await obterPosicaoPrecisa();
    expect(r).toMatchObject({ ok: true, aproximada: true });
    expect(posicao).toHaveBeenCalledWith({ accuracy: 3 });
  });

  it('negada → mensagem, sem ler o GPS', async () => {
    permissao.mockResolvedValue({ granted: false, status: 'denied' });
    expect(await obterPosicaoPrecisa()).toEqual({ ok: false, mensagem: expect.stringMatching(/^Permissão de localização negada/) });
    expect(posicao).not.toHaveBeenCalled();
  });

  it('GPS sem resposta no prazo → mensagem', async () => {
    permissao.mockResolvedValue({ granted: true, status: 'granted' });
    posicao.mockReturnValue(new Promise(() => {}));
    expect(await obterPosicaoPrecisa(10)).toEqual({ ok: false, mensagem: expect.stringMatching(/GPS/) });
  });
});
