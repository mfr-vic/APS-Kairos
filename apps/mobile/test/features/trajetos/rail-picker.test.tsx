// T29 / RF03 / TC04: a lista vem da API; sem API, usa o cache ou a lista local, avisando.
import { fireEvent, screen } from '@testing-library/react-native';

import { LINHAS_TRILHO_LOCAL } from '@/features/trajetos/linhas-trilho';
import { RailPicker } from '@/features/trajetos/rail-picker';
import { api } from '@/shared/api/client';
import { ApiError } from '@/shared/api/errors';
import { queryKeys } from '@/shared/api/query-keys';

import { novoQueryClient, renderComQuery } from '../../support/render-com-query';

jest.mock('@/shared/api/client', () => ({ api: { linhasTrilho: jest.fn() } }));

const linhasTrilho = api.linhasTrilho as jest.Mock;
const FORA = new ApiError(
  'rede',
  'Sem conexão com a API. Confira a internet e o endereço do servidor.'
);

describe('RailPicker', () => {
  beforeEach(() => jest.clearAllMocks());

  it('TC04: mostra só as linhas da API e salva a seleção', async () => {
    linhasTrilho.mockResolvedValue({
      linhas: [
        { linha: 'L1', nome: 'Azul', operadora: 'Metrô' },
        { linha: 'L6', nome: 'Laranja', operadora: 'Linha Uni' },
      ],
    });
    const onChange = jest.fn();
    await renderComQuery(<RailPicker selecionadas={['L1']} onChange={onChange} />);

    await fireEvent.press(await screen.findByLabelText('Linha 6-Laranja'));
    expect(onChange).toHaveBeenCalledWith(['L1', 'L6']);
    expect(screen.getByLabelText('Linha 1-Azul').props.accessibilityState).toMatchObject({
      checked: true,
    });
    expect(screen.queryByLabelText('Linha 2-Verde')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('API fora e sem cache → lista local com aviso', async () => {
    linhasTrilho.mockRejectedValue(FORA);
    await renderComQuery(<RailPicker selecionadas={[]} onChange={jest.fn()} />);
    expect(
      await screen.findByText(/lista local de linhas, que pode estar desatualizada/)
    ).toBeTruthy();
    for (const op of LINHAS_TRILHO_LOCAL) {
      expect(screen.getByLabelText(`Linha ${op.linha.slice(1)}-${op.nome}`)).toBeTruthy();
    }
    // 10 linhas com fonte (ARTESP 4–9 + Metrô 1, 2, 3, 15), operadora visível em cada uma
    expect(screen.getAllByRole('checkbox')).toHaveLength(10);
    expect(screen.getAllByText('ViaMobilidade 8 e 9')).toHaveLength(2);
    expect(screen.getByText('TIC Trens')).toBeTruthy();
    expect(screen.queryByLabelText(/^Linha 1[0-3]/)).toBeNull(); // CPTM sem fonte
  });

  it('API fora com lista em cache → usa o cache e avisa', async () => {
    linhasTrilho.mockRejectedValue(FORA);
    const client = novoQueryClient();
    client.setQueryData(
      queryKeys.linhasTrilho,
      { linhas: [{ linha: 'L4', nome: 'Amarela', operadora: 'ViaQuatro' }] },
      {
        updatedAt: 0, // vencido: força a revalidação, que falha
      }
    );
    await renderComQuery(<RailPicker selecionadas={[]} onChange={jest.fn()} />, client);
    expect(await screen.findByText(/última lista de linhas obtida da API/)).toBeTruthy();
    expect(screen.getByLabelText('Linha 4-Amarela')).toBeTruthy();
    expect(screen.queryByLabelText('Linha 1-Azul')).toBeNull();
  });
});
