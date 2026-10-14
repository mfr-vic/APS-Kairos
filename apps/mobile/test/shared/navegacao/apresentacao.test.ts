// Regressão do item 1 (13/10/2026): no Android a folha NÃO pode ser formSheet (congelava o app).
import { folhaTemTituloProprio, opcoesFolha, opcoesPilha } from '@/shared/navegacao/apresentacao';
import { motion } from '@/theme/motion';

describe('opcoesFolha', () => {
  it('Android: modal com cabeçalho nativo e título, nunca formSheet nem detents', () => {
    const o = opcoesFolha('android', 'Trajeto em destaque');
    expect(o.presentation).toBe('modal');
    expect(o).not.toHaveProperty('sheetAllowedDetents');
    expect(o).toMatchObject({ headerShown: true, title: 'Trajeto em destaque', animation: 'slide_from_bottom' });
    expect(folhaTemTituloProprio('android')).toBe(false);
  });

  it('iOS: folha nativa (formSheet) com detents e título desenhado pela própria folha', () => {
    const o = opcoesFolha('ios', 'Trajeto em destaque');
    expect(o).toMatchObject({ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], headerShown: false });
    expect(folhaTemTituloProprio('ios')).toBe(true);
  });

  it('movimento reduzido: a folha do Android só faz fade', () => {
    expect(opcoesFolha('android', 'x', true)).toMatchObject({ animation: 'fade' });
  });
});

describe('opcoesPilha', () => {
  it('desliza da direita no Android, padrão no iOS, fade com movimento reduzido', () => {
    expect(opcoesPilha('android', false).animation).toBe('slide_from_right');
    expect(opcoesPilha('ios', false).animation).toBe('default');
    expect(opcoesPilha('android', true).animation).toBe('fade');
    expect(opcoesPilha('ios', true).animation).toBe('fade');
  });

  it('duração da theme/motion (250 ms) e voltar por gesto ligado', () => {
    expect(opcoesPilha('ios', false)).toMatchObject({
      animationDuration: motion.slow,
      gestureEnabled: true,
      fullScreenGestureEnabled: true,
    });
    expect(opcoesPilha('android', false).fullScreenGestureEnabled).toBe(false);
  });
});
