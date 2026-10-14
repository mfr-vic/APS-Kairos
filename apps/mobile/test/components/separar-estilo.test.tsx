// Regressão de 13/10: `flex: 1` passado a ListRow/Cartao tocáveis ia só para a superfície
// interna; o Pressable não esticava (estrela do cartão de trajeto fora do lugar, widgets de
// emergência encolhidos).
import { render, screen } from '@testing-library/react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Cartao } from '@/components/cartao';
import { ListRow } from '@/components/list-row';
import { separarEstilo } from '@/components/separar-estilo';

describe('separarEstilo', () => {
  it('flex, largura e alinhamento vão para fora; o resto fica na superfície, que preenche', () => {
    const { fora, dentro } = separarEstilo([{ flex: 1, alignSelf: 'center', padding: 8 }, { width: 100, backgroundColor: 'red' }]);
    expect(fora).toEqual({ flex: 1, alignSelf: 'center', width: 100 });
    expect(dentro).toEqual({ flexGrow: 1, padding: 8, backgroundColor: 'red' });
  });

  it('sem style: nada fora', () => {
    expect(separarEstilo(undefined)).toEqual({ fora: {}, dentro: { flexGrow: 1 } });
  });
});

describe('Pressable externo recebe o flex', () => {
  it('ListRow e Cartao com onPress e style flex:1', async () => {
    await render(
      <View style={{ flexDirection: 'row' }}>
        <ListRow onPress={() => {}} accessibilityLabel="linha" style={{ flex: 1, paddingRight: 4 }}>
          <Text>a</Text>
        </ListRow>
        <Cartao onPress={() => {}} accessibilityLabel="cartao" style={{ flex: 1, alignItems: 'center' }}>
          <Text>b</Text>
        </Cartao>
      </View>
    );
    for (const nome of ['linha', 'cartao']) {
      expect(StyleSheet.flatten(screen.getByRole('button', { name: nome }).props.style)).toMatchObject({ flex: 1 });
    }
  });
});
