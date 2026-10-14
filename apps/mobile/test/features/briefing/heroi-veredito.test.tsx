// Herói: veredito → ação com horário → porquê → sinais → confiança (com o porquê) e recência;
// "Consultar de novo" quando Indeterminado ou confiança baixa (regressão do print de 13/10).
import { fireEvent, render, screen } from '@testing-library/react-native';

import { HeroiEsqueleto, HeroiVeredito } from '@/features/briefing/heroi-veredito';

import { AGORA, fixture } from '../../support/briefing';

describe('HeroiVeredito', () => {
  it('AGUARDAR: palavra, ação com horário, porquê, sinais e rodapé com confiança explicada', async () => {
    await render(<HeroiVeredito briefing={fixture('AGUARDAR')} agora={AGORA} />);
    expect(screen.getByText('Aguardar')).toBeTruthy();
    expect(screen.getByText('Espere até 11:00')).toBeTruthy();
    expect(screen.getByText('Chuva forte prevista às 09:00 (9,1 mm/h)')).toBeTruthy();
    expect(screen.getByText('Chuva forte às 09:00')).toBeTruthy(); // pílula
    expect(
      screen.getByText('Confiança média (Status dos trilhos indisponível) · atualizado às 08:08 (há 2 min)')
    ).toBeTruthy();
    expect(screen.getByText('chuva diminuindo nas próximas 3 h')).toBeTruthy();
  });

  it('INDETERMINADO: diz o que falhou e oferece "Consultar de novo"', async () => {
    const onAtualizar = jest.fn();
    await render(<HeroiVeredito briefing={fixture('INDETERMINADO')} agora={AGORA} onAtualizar={onAtualizar} />);
    expect(screen.getByText(/^Clima, Ônibus e Metrô e trem sem dados: Open-Meteo não respondeu em 3 s/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Consultar as fontes de novo' }));
    expect(onAtualizar).toHaveBeenCalledTimes(1);
  });

  // Visto na captura real de 13/10: explicação da API com causa técnica entre parênteses.
  it('confiança explicada sem a causa técnica entre parênteses', async () => {
    const b = { ...fixture('FAVORAVEL'), confianca: { nivel: 'MEDIA' as const, explicacao: 'Sem dados de alagamentos (Prazo do briefing esgotado antes da resposta da fonte)' } };
    await render(<HeroiVeredito briefing={b} agora={AGORA} />);
    expect(screen.getByText(/^Confiança média \(Sem dados de alagamentos\) · atualizado/)).toBeTruthy();
  });

  it('confiança alta: sem botão de consultar de novo', async () => {
    await render(<HeroiVeredito briefing={fixture('FAVORAVEL')} agora={AGORA} onAtualizar={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Consultar as fontes de novo' })).toBeNull();
  });

  it('com onPress (tela inicial): botão que abre o briefing, rótulo na ordem certa', async () => {
    const onPress = jest.fn();
    await render(<HeroiVeredito briefing={fixture('FAVORAVEL')} agora={AGORA} trajeto="MASP → Sé" onPress={onPress} />);
    const botao = screen.getByRole('button', { name: /^MASP → Sé\. Veredito: Favorável\. Saia agora\. 875A-10 chega às 08:20/ });
    await fireEvent.press(botao);
    expect(onPress).toHaveBeenCalled();
  });

  it('esqueleto diz o que está sendo consultado', async () => {
    await render(<HeroiEsqueleto trajeto="MASP → Sé" texto="Consultando chuva, ar, ônibus…" />);
    expect(screen.getByLabelText('Consultando chuva, ar, ônibus…')).toBeTruthy();
  });
});
