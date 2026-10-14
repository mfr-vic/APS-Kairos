// C.6: reconexão. Só a falta de rede pausa as consultas; "sem internet" não (a API é da rede local).
import { estaOnline } from '@/shared/api/network';

describe('estaOnline', () => {
  it.each([
    [{ isConnected: true }, true],
    [{ isConnected: false }, false],
    [{ isConnected: undefined }, true],
    [{ isConnected: true, isInternetReachable: false }, true],
  ])('%j → %s', (estado, esperado) => {
    expect(estaOnline(estado)).toBe(esperado);
  });
});
