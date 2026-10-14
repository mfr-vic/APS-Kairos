// Componente de estado: bloco (no lugar do conteúdo) e faixa (acima do conteúdo), com a ação.
import { fireEvent, render, screen } from '@testing-library/react-native';

import { EstadoTela } from '@/components/estado-tela';

describe('EstadoTela', () => {
  it('bloco vazio: título como cabeçalho, texto e ação primária', async () => {
    const onPress = jest.fn();
    await render(
      <EstadoTela
        tipo="vazio"
        titulo="Cadastre seu primeiro trajeto"
        texto="Informe origem e destino."
        acao={{ rotulo: 'Cadastrar trajeto', onPress }}
      />
    );
    expect(screen.getByRole('header', { name: 'Cadastre seu primeiro trajeto. Informe origem e destino.' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Cadastrar trajeto' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('erro é anunciado (alert + região viva) e a ação continua focável fora do grupo', async () => {
    const onPress = jest.fn();
    await render(
      <EstadoTela
        variante="faixa"
        tipo="erro"
        titulo="Previsão do tempo indisponível"
        texto="A API não respondeu em 5 s."
        acao={{ rotulo: 'Tentar de novo', onPress }}
      />
    );
    const alerta = screen.getByRole('alert');
    expect(alerta.props.accessibilityLiveRegion).toBe('polite');
    expect(alerta.props.accessibilityLabel).toBe('Previsão do tempo indisponível. A API não respondeu em 5 s.');
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('carregando na ação: estado busy', async () => {
    await render(
      <EstadoTela tipo="erro" titulo="x" acao={{ rotulo: 'Tentar de novo', onPress: () => {}, carregando: true }} />
    );
    expect(screen.getByRole('button', { name: 'Tentar de novo' }).props.accessibilityState).toMatchObject({ busy: true });
  });
});
