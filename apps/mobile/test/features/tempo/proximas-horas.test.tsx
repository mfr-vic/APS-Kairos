// Próximas horas: coluna "Agora", melhor janela marcada com a palavra "Janela" e chuva na cor
// da escala da B.8 com o valor escrito (nunca só a cor, sem legenda à parte).
import type { WeatherValue } from '@kairos/contracts';
import { render, screen } from '@testing-library/react-native';

import { marcarHoras, ProximasHoras } from '@/features/tempo/proximas-horas';

import { AGORA, fixture } from '../../support/briefing';

const aguardar = fixture('AGUARDAR');
const horas = (aguardar.observacoes.find((o) => o.dimension === 'weather')!.value as WeatherValue).horas;

describe('marcarHoras', () => {
  it('marca a hora em curso e as da janela', () => {
    const agora = Date.parse('2026-10-10T09:20:00-03:00');
    const r = marcarHoras(horas, agora, aguardar.janelaMeteorologica);
    expect(r.map((x) => [x.hora.hora.slice(11, 16), x.agora, x.naJanela])).toEqual([
      ['09:00', true, false],
      ['10:00', false, false],
      ['11:00', false, true],
      ['12:00', false, false],
    ]);
  });
});

describe('ProximasHoras', () => {
  it('janela com o texto "Janela" e rótulo acessível; chuva com o valor escrito', async () => {
    await render(<ProximasHoras horas={horas} agora={AGORA} janela={aguardar.janelaMeteorologica} />);
    expect(screen.getByText('Janela')).toBeTruthy();
    expect(screen.getByTestId('coluna-janela').props.accessibilityLabel).toMatch(/melhor horário para sair$/);
    expect(screen.getByText('9,1 mm')).toBeTruthy();
    expect(screen.getByLabelText(/^09:00: 18 graus, chuva forte, 9,1 milímetros por hora, 90% de chance/)).toBeTruthy();
  });

  it('sem horas: nada', async () => {
    await render(<ProximasHoras horas={[]} agora={AGORA} />);
    expect(screen.toJSON()).toBeNull();
  });
});
