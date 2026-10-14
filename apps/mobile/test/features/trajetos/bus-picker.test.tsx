// T29 / RF02 / TC03: linha → sentido → parada; até 3 linhas no mesmo ponto (API simulada).
import { TrajetoRequestSchema, type BusLine } from '@kairos/contracts';
import { fireEvent, screen } from '@testing-library/react-native';
import { onlineManager } from '@tanstack/react-query';

import { BusPicker } from '@/features/trajetos/bus-picker';
import { api } from '@/shared/api/client';

import { renderComQuery } from '../../support/render-com-query';

jest.mock('@/shared/api/client', () => ({
  api: { linhasOnibus: jest.fn(), paradasOnibus: jest.fn() },
}));

const linhasOnibus = api.linhasOnibus as jest.Mock;
const paradasOnibus = api.paradasOnibus as jest.Mock;

// Formato do spike T04 (cl=609 / 33377, cp=260016861)
const LINHAS_875A = {
  linhas: [
    {
      codigoLinha: 609,
      letreiro: '875A-10',
      sentido: 1,
      terminalPrincipal: 'PERDIZES',
      terminalSecundario: 'AEROPORTO',
    },
    {
      codigoLinha: 33377,
      letreiro: '875A-10',
      sentido: 2,
      terminalPrincipal: 'PERDIZES',
      terminalSecundario: 'AEROPORTO',
    },
  ],
};
const PARADAS = {
  paradas: [
    { codigoParada: 260016861, nome: 'PARADA A', endereco: 'R. X, 10', lat: -23.53, lon: -46.67 },
    { codigoParada: 111, nome: 'PARADA B', endereco: null, lat: -23.54, lon: -46.66 },
  ],
};

async function buscarLinha(termo: string) {
  await fireEvent.changeText(screen.getByLabelText('Linha de ônibus'), termo);
  await fireEvent.press(screen.getByText('Buscar linha'));
}

describe('BusPicker', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => onlineManager.setOnline(true));

  it('TC03: "875A" → sentido → parada → salva os códigos de linha e parada', async () => {
    linhasOnibus.mockResolvedValue(LINHAS_875A);
    paradasOnibus.mockResolvedValue(PARADAS);
    const onChange = jest.fn();
    await renderComQuery(<BusPicker selecionadas={[]} onChange={onChange} />);

    await buscarLinha('875A');
    const ida = await screen.findByLabelText('875A-10 · PERDIZES → AEROPORTO');
    expect(screen.getByLabelText('875A-10 · AEROPORTO → PERDIZES')).toBeTruthy(); // os dois sentidos
    await fireEvent.press(ida);
    await fireEvent.press(await screen.findByLabelText('PARADA A · R. X, 10 (260016861)'));

    expect(linhasOnibus).toHaveBeenCalledWith('875A', expect.anything());
    expect(paradasOnibus).toHaveBeenCalledWith(609, expect.anything());
    const linhas: BusLine[] = onChange.mock.calls[0][0];
    expect(linhas).toEqual([{ codigoLinha: 609, letreiro: '875A-10', codigoParada: 260016861 }]);
    expect(TrajetoRequestSchema.shape.onibus.safeParse(linhas).success).toBe(true);
  });

  it('com linha já escolhida, só oferece o MESMO ponto', async () => {
    linhasOnibus.mockResolvedValue(LINHAS_875A);
    paradasOnibus.mockResolvedValue(PARADAS);
    const atual: BusLine[] = [{ codigoLinha: 1, letreiro: '177H-10', codigoParada: 111 }];
    const onChange = jest.fn();
    await renderComQuery(<BusPicker selecionadas={atual} onChange={onChange} />);

    expect(screen.getByText('As próximas linhas precisam passar no ponto 111.')).toBeTruthy();
    await buscarLinha('875A');
    await fireEvent.press(await screen.findByLabelText('875A-10 · PERDIZES → AEROPORTO'));
    await fireEvent.press(await screen.findByLabelText('PARADA B (111)'));
    expect(screen.queryByLabelText(/PARADA A/)).toBeNull();
    expect(onChange).toHaveBeenCalledWith([
      ...atual,
      { codigoLinha: 609, letreiro: '875A-10', codigoParada: 111 },
    ]);
  });

  it('linha que não passa no ponto escolhido → mensagem, nada é adicionado', async () => {
    linhasOnibus.mockResolvedValue(LINHAS_875A);
    paradasOnibus.mockResolvedValue(PARADAS);
    const onChange = jest.fn();
    await renderComQuery(
      <BusPicker
        selecionadas={[{ codigoLinha: 1, letreiro: '177H-10', codigoParada: 999 }]}
        onChange={onChange}
      />
    );
    await buscarLinha('875A');
    await fireEvent.press(await screen.findByLabelText('875A-10 · PERDIZES → AEROPORTO'));
    expect(await screen.findByText(/^Esta linha não passa no ponto 999/)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('limite de 3 linhas: sem campo de busca', async () => {
    const tres: BusLine[] = [1, 2, 3].map((n) => ({
      codigoLinha: n,
      letreiro: `L${n}`,
      codigoParada: 111,
    }));
    await renderComQuery(<BusPicker selecionadas={tres} onChange={jest.fn()} />);
    expect(screen.getByText('Limite de 3 linhas atingido.')).toBeTruthy();
    expect(screen.queryByLabelText('Linha de ônibus')).toBeNull();
  });

  it('remover uma linha', async () => {
    const onChange = jest.fn();
    const duas: BusLine[] = [1, 2].map((n) => ({
      codigoLinha: n,
      letreiro: `L${n}`,
      codigoParada: 111,
    }));
    await renderComQuery(<BusPicker selecionadas={duas} onChange={onChange} />);
    await fireEvent.press(screen.getAllByText('Remover')[0]);
    expect(onChange).toHaveBeenCalledWith([duas[1]]);
  });

  it('sem rede → mensagem clara', async () => {
    onlineManager.setOnline(false);
    await renderComQuery(<BusPicker selecionadas={[]} onChange={jest.fn()} />);
    await buscarLinha('875A');
    expect(await screen.findByText(/^Sem conexão: a busca de ônibus precisa de rede/)).toBeTruthy();
    expect(linhasOnibus).not.toHaveBeenCalled();
  });
});
