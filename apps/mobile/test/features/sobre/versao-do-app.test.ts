// Versão na aba Sobre: número real e o ambiente; no .apk sem "(desenvolvimento)" (regressão 13/10).
import { rotuloVersao } from '@/features/sobre/versao-do-app';

describe('rotuloVersao', () => {
  it('Expo Go', () => {
    expect(rotuloVersao('0.1.0', 'storeClient', true)).toBe('Versão 0.1.0 · no Expo Go (desenvolvimento)');
  });
  it('.apk de release: só a versão', () => {
    expect(rotuloVersao('0.1.0', 'standalone', false)).toBe('Versão 0.1.0');
  });
  it('build de desenvolvimento', () => {
    expect(rotuloVersao('0.1.0', 'standalone', true)).toBe('Versão 0.1.0 · build de desenvolvimento');
  });
  it('sem versão no app.json', () => {
    expect(rotuloVersao(undefined, 'standalone', false)).toBe('Versão desconhecida');
  });
});
