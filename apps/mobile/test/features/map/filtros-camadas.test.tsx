// Chips das camadas do mapa: múltipla escolha acessível (checkbox), háptica de seleção e legenda.
import { fireEvent, render, screen } from '@testing-library/react-native';

import { FiltrosCamadas } from '@/features/map/filtros-camadas';
import { feedbackTatil } from '@/shared/feedback-tatil';

import { CAMADAS_EXEMPLO } from '../../support/camadas';

jest.mock('@/shared/feedback-tatil', () => ({ feedbackTatil: { selecao: jest.fn() } }));

describe('FiltrosCamadas', () => {
  it('mostra as 3 camadas com estado marcado e alterna com háptica', async () => {
    const onAlternar = jest.fn();
    await render(
      <FiltrosCamadas filtros={['chuva']} onAlternar={onAlternar} dados={CAMADAS_EXEMPLO} carregando={false} erro={null} />
    );
    expect(screen.getByRole('checkbox', { name: 'Camada Chuva' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Camada Alagamento' })).not.toBeChecked();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Camada Temperatura' }));
    expect(onAlternar).toHaveBeenCalledWith('temperatura');
    expect(feedbackTatil.selecao).toHaveBeenCalledTimes(1);
  });

  it('legenda só das camadas ligadas, com o impacto', async () => {
    await render(
      <FiltrosCamadas filtros={['alagamento', 'chuva']} onAlternar={jest.fn()} dados={CAMADAS_EXEMPLO} carregando={false} erro={null} />
    );
    expect(screen.getByText(/1 ponto histórico \(GeoSampa\)/)).toBeTruthy();
    expect(screen.getByText(/acima de 7,6 mm\/h = Aguardar/)).toBeTruthy();
    expect(screen.queryByText(/Informativa/)).toBeNull();
  });

  it('erro da API aparece em texto; sem filtros, nada de erro nem carregando', async () => {
    const { rerender } = await render(
      <FiltrosCamadas filtros={['chuva']} onAlternar={jest.fn()} dados={undefined} carregando erro="Sem conexão" />
    );
    expect(screen.getByText('Camadas indisponíveis: Sem conexão')).toBeTruthy();
    expect(screen.getByTestId('camadas-carregando')).toBeTruthy();
    await rerender(<FiltrosCamadas filtros={[]} onAlternar={jest.fn()} dados={undefined} carregando erro="Sem conexão" />);
    expect(screen.queryByText(/Camadas indisponíveis/)).toBeNull();
    expect(screen.queryByTestId('camadas-carregando')).toBeNull();
  });
});
