// useTrajetos() devolve a lista JÁ na ordem da hierarquia (a folha de seleção e a tela inicial
// consomem essa ordem); useRegistrarUso grava o uso só no aparelho e reordena na hora.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable, Text } from 'react-native';

import { CHAVE_USO_TRAJETOS, trajetoStore, usoStore } from '@/features/trajetos/storage';
import { trajetosOrdenadosDoCache, useRegistrarUso, useTrajetos } from '@/features/trajetos/use-trajetos';

import { novoQueryClient, renderComQuery } from '../../support/render-com-query';

const dados = (nome: string) => ({
  nome,
  trajeto: {
    origem: { lat: -23.56, lon: -46.65, rotulo: 'A' },
    destino: { lat: -23.55, lon: -46.63, rotulo: 'B' },
  },
});

function Tela() {
  const { data = [] } = useTrajetos();
  const registrar = useRegistrarUso();
  return (
    <>
      <Text testID="lista">{data.map((t) => t.nome).join(',')}</Text>
      {data.map((t) => (
        <Pressable key={t.id} accessibilityRole="button" onPress={() => registrar.mutate(t.id)}>
          <Text>{`abrir ${t.nome}`}</Text>
        </Pressable>
      ))}
    </>
  );
}

describe('useTrajetos (hierarquia)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('favoritos primeiro, depois o mais usado; abrir um briefing reordena e grava só id + instante', async () => {
    await trajetoStore.criar(dados('A'));
    const b = await trajetoStore.criar(dados('B'));
    const c = await trajetoStore.criar(dados('C'));
    await trajetoStore.definirFavorito(c.id, true);
    const client = novoQueryClient();
    await renderComQuery(<Tela />, client);
    await waitFor(() => expect(screen.getByTestId('lista')).toHaveTextContent(/^C,A,B$/));

    await fireEvent.press(screen.getByText('abrir B'));
    await waitFor(() => expect(screen.getByTestId('lista')).toHaveTextContent(/^C,B,A$/));
    await fireEvent.press(screen.getByText('abrir B'));
    await waitFor(() => expect(screen.getByTestId('lista')).toHaveTextContent(/^C,B,A$/));

    const gravado = JSON.parse((await AsyncStorage.getItem(CHAVE_USO_TRAJETOS)) as string);
    expect(Object.keys(gravado)).toEqual([b.id]);
    expect(gravado[b.id]).toHaveLength(1); // dois toques seguidos = um uso
    expect(typeof gravado[b.id][0]).toBe('number');

    // A mesma ordem fica disponível fora do render (Desfazer, mensagens).
    expect(trajetosOrdenadosDoCache(client).map((t) => t.nome)).toEqual(['C', 'B', 'A']);
  });

  it('cache cru continua na ordem de cadastro (a ordem é derivada, não gravada)', async () => {
    await trajetoStore.criar(dados('A'));
    const b = await trajetoStore.criar(dados('B'));
    await usoStore.registrar(b.id);
    const client = novoQueryClient();
    await renderComQuery(<Tela />, client);
    await waitFor(() => expect(screen.getByTestId('lista')).toHaveTextContent(/^B,A$/));
    expect((await trajetoStore.listar()).map((t) => t.nome)).toEqual(['A', 'B']);
  });
});
