// T29 / TC01 + TC22 na tela: origem pelo GPS, destino pela busca, salvar; nome vazio não salva.
import { fireEvent, screen } from '@testing-library/react-native';

import { obterLocalizacao } from '@/features/trajetos/obter-localizacao';
import { TrajetoForm } from '@/features/trajetos/trajeto-form';
import { FORMULARIO_VAZIO } from '@/features/trajetos/trajeto-form-validation';
import { api } from '@/shared/api/client';

import { renderComQuery } from '../../support/render-com-query';

jest.mock('@/shared/api/client', () => ({
  api: { geocode: jest.fn(), linhasTrilho: jest.fn() },
}));
jest.mock('@/features/trajetos/obter-localizacao', () => ({ obterLocalizacao: jest.fn() }));

const ROTULO_LONGO =
  'Avenida Paulista, 1000, Bela Vista, São Paulo, Região Imediata de São Paulo, Brasil';

describe('TrajetoForm', () => {
  beforeEach(() => {
    (api.linhasTrilho as jest.Mock).mockResolvedValue({ linhas: [] });
    (obterLocalizacao as jest.Mock).mockResolvedValue({
      ok: true,
      ponto: { lat: -23.5614961, lon: -46.6559677 },
    });
    (api.geocode as jest.Mock).mockResolvedValue({
      resultados: [{ lat: -23.5649, lon: -46.6519, rotulo: ROTULO_LONGO }],
    });
  });

  it('TC01: GPS na origem + endereço no destino → dados válidos (rótulo ≤ 60)', async () => {
    const onSalvar = jest.fn();
    await renderComQuery(
      <TrajetoForm valoresIniciais={FORMULARIO_VAZIO} salvando={false} onSalvar={onSalvar} />
    );
    await fireEvent.changeText(screen.getByLabelText('Nome do trajeto'), 'Casa → Paulista');
    await fireEvent.press(screen.getByText('Usar minha localização'));
    await screen.findByText('Escolhido: Minha localização');
    await fireEvent.changeText(
      screen.getByLabelText('Buscar endereço do destino'),
      'Av. Paulista, 1000'
    );
    await fireEvent.press(screen.getAllByText('Buscar endereço')[1]);
    await fireEvent.press(await screen.findByLabelText(`Escolher ${ROTULO_LONGO}`));
    await fireEvent.press(screen.getByText('Salvar trajeto'));

    expect(onSalvar).toHaveBeenCalledTimes(1);
    const { trajeto } = onSalvar.mock.calls[0][0];
    expect(trajeto.origem).toEqual({ lat: -23.5614961, lon: -46.6559677, rotulo: 'Minha localização' });
    expect(trajeto.destino).toMatchObject({ lat: -23.5649, lon: -46.6519 });
    expect(trajeto.destino.rotulo.length).toBeLessThanOrEqual(60);
  });

  it('TC22: nome vazio e sem destino → mensagens e não salva', async () => {
    const onSalvar = jest.fn();
    await renderComQuery(
      <TrajetoForm valoresIniciais={FORMULARIO_VAZIO} salvando={false} onSalvar={onSalvar} />
    );
    await fireEvent.press(screen.getByText('Salvar trajeto'));
    expect(screen.getByText('Dê um nome ao trajeto.')).toBeTruthy();
    expect(screen.getByText('Informe a latitude do destino.')).toBeTruthy();
    expect(onSalvar).not.toHaveBeenCalled();
  });
});
