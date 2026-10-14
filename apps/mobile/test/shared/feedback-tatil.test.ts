// Háptica: cada momento chama o expo-haptics certo (iOS e Android), pode ser desligada (e a
// preferência persiste), é no-op na web e nunca derruba a ação se o módulo falhar.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import {
  CHAVE_HAPTICA,
  carregarPreferenciaTatil,
  definirHapticaAtiva,
  feedbackTatil,
  hapticaAtiva,
  marcaTatil,
  reiniciarFeedbackTatil,
  vibrar,
} from '@/shared/feedback-tatil';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  performAndroidHapticsAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  AndroidHaptics: {
    Virtual_Key: 'virtual-key',
    Clock_Tick: 'clock-tick',
    Long_Press: 'long-press',
    Confirm: 'confirm',
    Reject: 'reject',
  },
}));

const SO_ORIGINAL = Platform.OS;
const VERSAO_ORIGINAL = Platform.Version;

function definirPlataforma(os: string, versao: number | string) {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  Object.defineProperty(Platform, 'Version', { value: versao, configurable: true });
}

beforeEach(async () => {
  jest.clearAllMocks();
  reiniciarFeedbackTatil();
  await AsyncStorage.clear();
});

afterEach(() => definirPlataforma(SO_ORIGINAL, VERSAO_ORIGINAL));

describe('feedbackTatil (iOS / genérico)', () => {
  beforeEach(() => definirPlataforma('ios', '18.0'));

  it('um haptic por momento, com o tipo certo', () => {
    feedbackTatil.toque();
    expect(Haptics.impactAsync).toHaveBeenLastCalledWith('light');
    feedbackTatil.selecao();
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    feedbackTatil.sucesso();
    expect(Haptics.notificationAsync).toHaveBeenLastCalledWith('success');
    feedbackTatil.aviso();
    expect(Haptics.notificationAsync).toHaveBeenLastCalledWith('warning');
    feedbackTatil.erro();
    expect(Haptics.notificationAsync).toHaveBeenLastCalledWith('error');
    feedbackTatil.destrutivo();
    expect(Haptics.impactAsync).toHaveBeenLastCalledWith('medium');
    expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
  });

  it('marcaTatil conta os disparos (o componente sabe se o handler já vibrou)', () => {
    const antes = marcaTatil();
    vibrar('selecao');
    expect(marcaTatil()).toBe(antes + 1);
  });

  it('módulo que lança ou rejeita não quebra', () => {
    (Haptics.selectionAsync as jest.Mock).mockImplementationOnce(() => {
      throw new Error('sem nativo');
    });
    expect(() => feedbackTatil.selecao()).not.toThrow();
    (Haptics.selectionAsync as jest.Mock).mockRejectedValueOnce(new Error('x'));
    expect(() => feedbackTatil.selecao()).not.toThrow();
  });
});

describe('feedbackTatil (Android)', () => {
  it('Android 11+ usa o motor de háptica do sistema para todos os tipos', () => {
    definirPlataforma('android', 34);
    feedbackTatil.toque();
    feedbackTatil.selecao();
    feedbackTatil.destrutivo();
    feedbackTatil.sucesso();
    feedbackTatil.erro();
    const chamadas = (Haptics.performAndroidHapticsAsync as jest.Mock).mock.calls.map((c) => c[0]);
    expect(chamadas).toEqual(['virtual-key', 'clock-tick', 'long-press', 'confirm', 'reject']);
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it('Android antigo (< API 30): sucesso/erro caem na notificação genérica', () => {
    definirPlataforma('android', 28);
    feedbackTatil.sucesso();
    feedbackTatil.erro();
    feedbackTatil.toque();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('error');
    expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledWith('virtual-key');
  });
});

describe('preferência', () => {
  it('desligada: nada vibra e a escolha é salva', async () => {
    await definirHapticaAtiva(false);
    expect(hapticaAtiva()).toBe(false);
    expect(await AsyncStorage.getItem(CHAVE_HAPTICA)).toBe('off');
    feedbackTatil.sucesso();
    feedbackTatil.selecao();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });

  it('lê a preferência salva ao iniciar', async () => {
    await AsyncStorage.setItem(CHAVE_HAPTICA, 'off');
    await carregarPreferenciaTatil();
    expect(hapticaAtiva()).toBe(false);
  });

  it('web: no-op', () => {
    definirPlataforma('web', 0);
    feedbackTatil.toque();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });
});
