// Tema claro/escuro/do dispositivo: trocar o tema muda as cores resolvidas e a
// preferência persiste em kairos:tema:v1 (sobrevive a recarga do provider).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { palettes, useColors } from '@/theme';
import { CHAVE_TEMA, TemaProvider, useTemaPreferido, type TemaPreferido } from '@/theme/tema-provider';

function Sonda() {
  const c = useColors();
  const { tema, definirTema } = useTemaPreferido();
  const botao = (t: TemaPreferido) => (
    <Pressable key={t} testID={`botao-${t}`} onPress={() => definirTema(t)}>
      <Text>{t}</Text>
    </Pressable>
  );
  return (
    <>
      <Text testID="sonda">{`${tema}:${c.background}`}</Text>
      {(['claro', 'escuro', 'sistema'] as const).map(botao)}
    </>
  );
}

const app = (key = '1') => (
  <TemaProvider key={key}>
    <Sonda />
  </TemaProvider>
);

describe('TemaProvider', () => {
  beforeEach(() => AsyncStorage.clear());

  it('padrão "sistema" (claro nos testes) e trocar para escuro muda o fundo', async () => {
    await render(app());
    expect(screen.getByTestId('sonda')).toHaveTextContent(`sistema:${palettes.light.background}`);
    await fireEvent.press(screen.getByTestId('botao-escuro'));
    expect(screen.getByTestId('sonda')).toHaveTextContent(`escuro:${palettes.dark.background}`);
  });

  it('persiste em kairos:tema:v1 e sobrevive a recarga', async () => {
    await render(app());
    await fireEvent.press(screen.getByTestId('botao-escuro'));
    await waitFor(async () => expect(await AsyncStorage.getItem(CHAVE_TEMA)).toBe('escuro'));

    // "Recarga": key nova força um provider novo, que lê a preferência salva.
    await screen.rerender(app('2'));
    await waitFor(() =>
      expect(screen.getByTestId('sonda')).toHaveTextContent(`escuro:${palettes.dark.background}`)
    );
  });

  it('valor desconhecido no armazenamento cai em "sistema"', async () => {
    await AsyncStorage.setItem(CHAVE_TEMA, 'roxo');
    await render(app());
    await waitFor(() =>
      expect(screen.getByTestId('sonda')).toHaveTextContent(`sistema:${palettes.light.background}`)
    );
  });
});
