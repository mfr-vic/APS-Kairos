// Regressão de 14/10/2026: no Expo Go do Android, importar expo-notifications lança e derrubava o app.
import { Platform } from 'react-native';

function carregar(os: 'android' | 'ios', ambiente: string) {
  let m!: typeof import('@/features/notificacoes/modulo-notificacoes');
  const fabrica = jest.fn(() => ({}));
  jest.isolateModules(() => {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { executionEnvironment: ambiente },
      ExecutionEnvironment: { StoreClient: 'storeClient', Standalone: 'standalone' },
    }));
    jest.doMock('expo-notifications', fabrica);
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
    try {
      m = require('@/features/notificacoes/modulo-notificacoes');
    } finally {
      Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
    }
  });
  return { m, fabrica };
}

afterEach(() => {
  jest.dontMock('expo-constants');
  jest.dontMock('expo-notifications');
});

it('no Expo Go do Android não carrega o módulo e desliga os lembretes', () => {
  const { m, fabrica } = carregar('android', 'storeClient');
  expect(m.suportaLembretes).toBe(false);
  expect(m.notificacoes()).toBeNull();
  expect(fabrica).not.toHaveBeenCalled();
});

it('no .apk (standalone) carrega o módulo sob demanda', () => {
  const { m, fabrica } = carregar('android', 'standalone');
  expect(m.suportaLembretes).toBe(true);
  expect(fabrica).not.toHaveBeenCalled();
  expect(m.notificacoes()).not.toBeNull();
  expect(fabrica).toHaveBeenCalledTimes(1);
});
