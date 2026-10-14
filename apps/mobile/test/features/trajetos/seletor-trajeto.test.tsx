// Folha "Trajeto em destaque": busca, "Novo trajeto", ✓ no escolhido e escolha de outro.
import { fireEvent, screen } from '@testing-library/react-native';

import { filtrarTrajetos, SeletorTrajeto } from '@/features/trajetos/seletor-trajeto';
import type { TrajetoSalvo } from '@/features/trajetos/storage';

import { renderComQuery } from '../../support/render-com-query';

const tr = (id: string, nome: string, origem = 'Casa', destino = 'Sé'): TrajetoSalvo => ({
  id,
  nome,
  criadoEm: '2026-10-10T08:00:00-03:00',
  atualizadoEm: '2026-10-10T08:00:00-03:00',
  trajeto: {
    origem: { lat: -23.5, lon: -46.6, rotulo: origem },
    destino: { lat: -23.5, lon: -46.6, rotulo: destino },
    onibus: [],
    trilhos: [],
  },
});

const lista = [tr('a', 'MASP → Sé'), tr('b', 'Pinheiros → Luz', 'Pinheiros', 'Luz'), tr('c', 'Rolê'), tr('d', 'Academia')];

describe('filtrarTrajetos', () => {
  it('sem acento e sem caixa, por nome, origem ou destino', () => {
    expect(filtrarTrajetos(lista, 'luz').map((t) => t.id)).toEqual(['b']);
    expect(filtrarTrajetos(lista, 'ROLE').map((t) => t.id)).toEqual(['c']);
    expect(filtrarTrajetos(lista, '  ')).toHaveLength(4);
  });
});

describe('SeletorTrajeto', () => {
  it('✓ no escolhido (selected), escolher outro chama onEscolher, busca filtra e explica o vazio', async () => {
    const onEscolher = jest.fn();
    const onNovo = jest.fn();
    await renderComQuery(<SeletorTrajeto trajetos={lista} principalId="a" onEscolher={onEscolher} onNovo={onNovo} />);
    expect(screen.getByRole('button', { name: /^MASP → Sé, de Casa a Sé/ }).props.accessibilityState).toMatchObject({
      selected: true,
    });
    await fireEvent.press(screen.getByRole('button', { name: /^Pinheiros → Luz/ }));
    expect(onEscolher).toHaveBeenCalledWith(lista[1]);
    await fireEvent.press(screen.getByRole('button', { name: 'Novo trajeto' }));
    expect(onNovo).toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Buscar trajeto'), 'xyz');
    expect(screen.getByText('Nenhum trajeto com “xyz”. Confira a grafia ou cadastre um novo.')).toBeTruthy();
  });

  it('comTitulo=false (Android: o cabeçalho nativo já mostra "Trajeto em destaque") não repete o título', async () => {
    await renderComQuery(
      <SeletorTrajeto trajetos={lista} principalId="a" onEscolher={jest.fn()} onNovo={jest.fn()} comTitulo={false} />
    );
    expect(screen.queryByText('Trajeto em destaque')).toBeNull();
    expect(screen.getByRole('button', { name: 'Novo trajeto' })).toBeTruthy();
  });
});
