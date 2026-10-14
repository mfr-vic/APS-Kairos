// Cartão de trajeto: origem → destino, linhas com nome, veredito + sinal + próxima chegada, e
// "Mais ações" visível (regressão de 13/10: só nome + bolinhas e a muleta "toque e segure"),
// e a estrela de favorito com selo (item 2 de 13/10: favoritar sem sinal visual nem como desfazer).
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { CartaoTrajeto, situacaoDoTrajeto } from '@/features/trajetos/cartao-trajeto';
import type { TrajetoSalvo } from '@/features/trajetos/storage';
import { queryKeys } from '@/shared/api/query-keys';
import { liberarNavegacao } from '@/shared/navegacao/use-navegacao';

import { AGORA, comObservacao, fixture, trilhos } from '../../support/briefing';
import { novoQueryClient, renderComQuery } from '../../support/render-com-query';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const t: TrajetoSalvo = {
  id: 't1',
  nome: 'Casa → Trabalho',
  criadoEm: '2026-10-10T08:00:00-03:00',
  atualizadoEm: '2026-10-10T08:00:00-03:00',
  trajeto: {
    origem: { lat: -23.561, lon: -46.655, rotulo: 'Paulista' },
    destino: { lat: -23.533, lon: -46.634, rotulo: 'Sé' },
    onibus: [{ codigoLinha: 609, letreiro: '875A-10', codigoParada: 260016861 }],
    trilhos: ['L4'],
  },
};

describe('situacaoDoTrajeto', () => {
  it('sinal mais grave + próxima chegada + recência', () => {
    const b = comObservacao(fixture('FAVORAVEL'), trilhos([{ linha: 'L4', situacao: 'ALTERADA', statusTexto: 'x' }]));
    expect(situacaoDoTrajeto(b, AGORA)).toBe('Linha 4 alterada · 875A-10 em 10 min · gerado há 2 min');
    expect(situacaoDoTrajeto(undefined, AGORA)).toBe('Sem briefing ainda: toque para consultar');
  });
});

describe('CartaoTrajeto', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    liberarNavegacao();
  });

  it('mostra origem → destino, nome da linha de Metrô e o veredito; toque abre o briefing', async () => {
    const client = novoQueryClient();
    client.setQueryData(queryKeys.briefing(t.id, t.atualizadoEm), fixture('FAVORAVEL'));
    await renderComQuery(<CartaoTrajeto trajeto={t} agora={AGORA} principal />, client);
    expect(screen.getByText('Paulista → Sé')).toBeTruthy();
    expect(screen.getByText('Amarela')).toBeTruthy();
    expect(screen.getByLabelText('Último veredito: Favorável')).toBeTruthy();
    const linha = screen.getByRole('button', { name: /^Casa → Trabalho, trajeto principal\. de Paulista a Sé\. linhas: ônibus 875A-10, Linha 4-Amarela/ });
    await fireEvent.press(linha);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/trajetos/[id]/briefing', params: { id: 't1' } });
  });

  it('estrela vazia = "Favoritar"; o toque chama onAlternarFavorito com o trajeto', async () => {
    const alternar = jest.fn();
    await renderComQuery(<CartaoTrajeto trajeto={t} agora={AGORA} principal={false} onAlternarFavorito={alternar} />);
    const estrela = screen.getByRole('button', { name: 'Favoritar: Casa → Trabalho' });
    expect(estrela.props.accessibilityState).toMatchObject({ selected: false });
    expect(screen.queryByText('Favorito')).toBeNull();
    await fireEvent.press(estrela);
    expect(alternar).toHaveBeenCalledWith(t);
    expect(router.push).not.toHaveBeenCalled(); // a estrela não abre o briefing
  });

  it('favorito: selo "Favorito", estrela marcada "Remover dos favoritos" e o estado no rótulo da linha', async () => {
    const alternar = jest.fn();
    const fav = { ...t, favorito: true };
    await renderComQuery(<CartaoTrajeto trajeto={fav} agora={AGORA} principal onAlternarFavorito={alternar} />);
    expect(screen.getByText('Favorito')).toBeTruthy();
    expect(screen.getByText('Principal')).toBeTruthy();
    const estrela = screen.getByRole('button', { name: 'Remover dos favoritos: Casa → Trabalho' });
    expect(estrela.props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByRole('button', { name: /^Casa → Trabalho, favorito, trajeto principal\. de Paulista a Sé/ })).toBeTruthy();
    await fireEvent.press(estrela);
    expect(alternar).toHaveBeenCalledWith(fav);
  });

  it('item 8: toques repetidos no cartão abrem o briefing UMA vez', async () => {
    await renderComQuery(<CartaoTrajeto trajeto={t} agora={AGORA} principal={false} />);
    const linha = screen.getByRole('button', { name: /^Casa → Trabalho\. de Paulista a Sé/ });
    await fireEvent.press(linha);
    await fireEvent.press(linha);
    await fireEvent.press(linha);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('"Mais ações" é um botão visível que abre a folha de ações', async () => {
    await renderComQuery(<CartaoTrajeto trajeto={t} agora={AGORA} principal={false} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Mais ações: Casa → Trabalho' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/trajetos/[id]/acoes', params: { id: 't1' } });
  });
});
