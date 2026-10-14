// Ações com retorno perceptível: tornar principal, favoritar e excluir mostram snackbar com Desfazer, e o
// Desfazer devolve exatamente o estado anterior (inclusive o briefing salvo do trajeto).
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { Pressable, Text } from 'react-native';

import { SnackbarProvider } from '@/components/snackbar';
import { trajetoStore, type TrajetoSalvo } from '@/features/trajetos/storage';
import { useAcoesTrajeto } from '@/features/trajetos/use-acoes-trajeto';
import { useTrajetos } from '@/features/trajetos/use-trajetos';
import { queryKeys } from '@/shared/api/query-keys';

import { fixture } from '../../support/briefing';
import { novoQueryClient, renderComQuery } from '../../support/render-com-query';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const dados = (nome: string) => ({
  nome,
  trajeto: {
    origem: { lat: -23.56, lon: -46.65, rotulo: 'A' },
    destino: { lat: -23.55, lon: -46.63, rotulo: 'B' },
  },
});

function Tela() {
  const { data = [] } = useTrajetos();
  const { tornarPrincipal, excluirComDesfazer, alternarFavorito, principalAutomatico } = useAcoesTrajeto();
  return (
    <>
      <Text testID="lista">{data.map((t) => `${t.nome}${t.principal ? '*' : ''}${t.favorito ? '+' : ''}`).join(',')}</Text>
      <Pressable accessibilityRole="button" onPress={() => principalAutomatico()}>
        <Text>automatico</Text>
      </Pressable>
      {data.map((t: TrajetoSalvo) => (
        <Pressable key={`f${t.id}`} accessibilityRole="button" onPress={() => alternarFavorito(t)}>
          <Text>{`estrela ${t.nome}`}</Text>
        </Pressable>
      ))}
      {data.map((t: TrajetoSalvo) => (
        <Pressable key={t.id} accessibilityRole="button" onPress={() => tornarPrincipal(t)}>
          <Text>{`principal ${t.nome}`}</Text>
        </Pressable>
      ))}
      {data.map((t: TrajetoSalvo) => (
        <Pressable key={`x${t.id}`} accessibilityRole="button" onPress={() => excluirComDesfazer(t)}>
          <Text>{`excluir ${t.nome}`}</Text>
        </Pressable>
      ))}
    </>
  );
}

async function montar() {
  const client = novoQueryClient();
  await renderComQuery(
    <SnackbarProvider>
      <Tela />
    </SnackbarProvider>,
    client
  );
  return client;
}

describe('useAcoesTrajeto', () => {
  beforeEach(async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('tornar principal → "“B” agora é o principal" + Desfazer volta ao anterior', async () => {
    await trajetoStore.criar(dados('A'));
    await trajetoStore.criar(dados('B'));
    await montar();
    await waitFor(() => expect(screen.getByTestId('lista')).toHaveTextContent('A,B'));
    await fireEvent.press(screen.getByText('principal B'));
    await waitFor(() => expect(screen.getByText('“B” agora é o principal')).toBeTruthy());
    expect(screen.getByTestId('lista')).toHaveTextContent('A,B*');
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Desfazer' })));
    await waitFor(() => expect(screen.getByText('“A” voltou a ser o principal')).toBeTruthy());
    expect(screen.getByTestId('lista')).toHaveTextContent(/^A,B$/);
  });

  it('excluir → some na hora + "“B” excluído" + Desfazer restaura na posição e com o briefing salvo', async () => {
    await trajetoStore.criar(dados('A'));
    const b = await trajetoStore.criar(dados('B'));
    await trajetoStore.criar(dados('C'));
    const client = await montar();
    client.setQueryData(queryKeys.briefing(b.id, b.atualizadoEm), fixture('FAVORAVEL'));
    await waitFor(() => expect(screen.getByTestId('lista')).toHaveTextContent('A,B,C'));
    await fireEvent.press(screen.getByText('excluir B'));
    await waitFor(() => expect(screen.getByText('“B” excluído')).toBeTruthy());
    expect(screen.getByTestId('lista')).toHaveTextContent(/^A,C$/);
    expect(client.getQueryData(queryKeys.briefing(b.id, b.atualizadoEm))).toBeUndefined();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Desfazer' })));
    await waitFor(() => expect(screen.getByText('“B” restaurado')).toBeTruthy());
    expect(screen.getByTestId('lista')).toHaveTextContent(/^A,B,C$/);
    expect(client.getQueryData(queryKeys.briefing(b.id, b.atualizadoEm))).toEqual(fixture('FAVORAVEL'));
  });

  it('favoritar → estrela na hora + sobe para o topo + "“B” nos favoritos"; Desfazer tira a estrela', async () => {
    await trajetoStore.criar(dados('A'));
    await trajetoStore.criar(dados('B'));
    await montar();
    await waitFor(() => expect(screen.getByTestId('lista')).toHaveTextContent(/^A,B$/));
    await fireEvent.press(screen.getByText('estrela B'));
    await waitFor(() => expect(screen.getByText('“B” nos favoritos')).toBeTruthy());
    expect(screen.getByTestId('lista')).toHaveTextContent(/^B\+,A$/); // favoritos primeiro
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Desfazer' })));
    await waitFor(() => expect(screen.getByText('“B” saiu dos favoritos')).toBeTruthy());
    expect(screen.getByTestId('lista')).toHaveTextContent(/^A,B$/);
    expect((await trajetoStore.obter((await trajetoStore.listar())[1].id))?.favorito).toBe(false);
  });

  it('desfavoritar → "saiu dos favoritos" com Desfazer e haptic de seleção (não destrutivo)', async () => {
    const a = await trajetoStore.criar(dados('A'));
    await trajetoStore.definirFavorito(a.id, true);
    await trajetoStore.criar(dados('B'));
    await montar();
    await waitFor(() => expect(screen.getByTestId('lista')).toHaveTextContent(/^A\+,B$/));
    await fireEvent.press(screen.getByText('estrela A'));
    await waitFor(() => expect(screen.getByText('“A” saiu dos favoritos')).toBeTruthy());
    expect(screen.getByTestId('lista')).toHaveTextContent(/^A,B$/);
    expect(Haptics.selectionAsync).toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Desfazer' })).toBeTruthy();
  });

  it('principal automático: desfaz a fixação, avisa e o Desfazer fixa de novo', async () => {
    await trajetoStore.criar(dados('A'));
    const b = await trajetoStore.criar(dados('B'));
    await trajetoStore.definirPrincipal(b.id);
    await montar();
    await waitFor(() => expect(screen.getByTestId('lista')).toHaveTextContent(/^A,B\*$/));
    await fireEvent.press(screen.getByText('automatico'));
    await waitFor(() =>
      expect(screen.getByText('Principal automático: o topo segue seus favoritos e horários')).toBeTruthy()
    );
    expect(screen.getByTestId('lista')).toHaveTextContent(/^A,B$/);
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Desfazer' })));
    await waitFor(() => expect(screen.getByText('“B” voltou a ser o principal')).toBeTruthy());
    expect(screen.getByTestId('lista')).toHaveTextContent(/^A,B\*$/);
  });
});