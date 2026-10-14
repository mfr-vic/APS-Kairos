// T29 / RF17 / TC19 (API parada → erro) e TC20 (modo avião → query pausada): ambos avisam.
import { fireEvent, render, screen } from '@testing-library/react-native';

import { AvisoDesatualizado, motivoDesatualizado } from '@/features/briefing/aviso-desatualizado';
import { ApiError } from '@/shared/api/errors';

describe('motivoDesatualizado', () => {
  it('TC19: erro da API → mensagem do erro', () => {
    const e = new ApiError(
      'rede',
      'Sem conexão com a API. Confira a internet e o endereço do servidor.'
    );
    expect(motivoDesatualizado(e, 'idle')).toBe(e.message);
  });

  it('TC20: sem rede (pausada, sem erro) → avisa', () => {
    expect(motivoDesatualizado(null, 'paused')).toBe('Sem conexão com a internet.');
  });

  it('atualizado ou atualizando → sem aviso', () => {
    expect(motivoDesatualizado(null, 'idle')).toBeNull();
    expect(motivoDesatualizado(null, 'fetching')).toBeNull();
  });
});

describe('AvisoDesatualizado', () => {
  it('mostra a idade do briefing e o motivo', async () => {
    const agora = Date.parse('2026-10-10T08:10:00-03:00');
    await render(
      <AvisoDesatualizado
        geradoEm="2026-10-10T08:00:00-03:00"
        agora={agora}
        motivo="Sem conexão com a rede."
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/Desatualizado · gerado há 10 min \(às 08:00\)/);
    expect(
      screen.getByText('Sem conexão com a rede. Mostrando o último briefing salvo.')
    ).toBeTruthy();
    // Sem onAtualizar (offline), não há botão inútil.
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('com onAtualizar: "Tentar de novo" chama a atualização', async () => {
    const onAtualizar = jest.fn();
    await render(
      <AvisoDesatualizado
        geradoEm="2026-10-10T08:00:00-03:00"
        agora={Date.parse('2026-10-10T08:10:00-03:00')}
        motivo="A API não respondeu em 8 s."
        onAtualizar={onAtualizar}
      />
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(onAtualizar).toHaveBeenCalledTimes(1);
  });
});
