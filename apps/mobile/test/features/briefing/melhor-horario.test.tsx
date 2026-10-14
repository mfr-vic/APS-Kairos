// "Melhor horário para sair": só fora do Favorável; horário grande + quanto falta + porquê.
import { render, screen } from '@testing-library/react-native';

import { MelhorHorario, mostraMelhorHorario, textoMelhorHorario } from '@/features/briefing/melhor-horario';

import { AGORA, briefingCom, fixture } from '../../support/briefing';

describe('textoMelhorHorario', () => {
  const aguardar = fixture('AGUARDAR');

  it('com janela no futuro: horário, quanto falta e o porquê', () => {
    expect(textoMelhorHorario(aguardar, AGORA)).toEqual({
      horario: '11:00–12:00',
      quando: 'Começa em 2 h 50 min.',
      porque: 'Primeira hora sem chuva acima de 2,5 mm/h nas próximas 6 h.',
    });
  });

  it('dentro da janela e depois dela', () => {
    expect(textoMelhorHorario(aguardar, Date.parse('2026-10-10T11:20:00-03:00')).quando).toBe('Agora, até as 12:00.');
    expect(textoMelhorHorario(aguardar, Date.parse('2026-10-10T12:30:00-03:00')).quando).toBe(
      'Essa janela já passou: atualize o briefing.'
    );
  });

  it('sem janela por ar ruim: explica a suspensão', () => {
    expect(textoMelhorHorario(fixture('ATENCAO'), AGORA).porque).toMatch(/^Com o ar na faixa Ruim/);
  });

  it('sem janela e sem previsão do tempo', () => {
    expect(textoMelhorHorario(fixture('INDETERMINADO'), AGORA).porque).toBe(
      'Sem previsão do tempo, não dá para indicar um horário.'
    );
  });
});

describe('mostraMelhorHorario', () => {
  it('só quando o veredito vem do tempo/alagamento/ar (ou é Indeterminado)', () => {
    expect(mostraMelhorHorario(fixture('FAVORAVEL'))).toBe(false);
    expect(mostraMelhorHorario(fixture('AGUARDAR'))).toBe(true);
    expect(mostraMelhorHorario(fixture('ATENCAO'))).toBe(true); // RN05 (ar)
    expect(mostraMelhorHorario(fixture('INDETERMINADO'))).toBe(true);
  });

  // Regressão (captura real de 13/10, 03:13): Metrô fechado + janela de chuva às 04:00.
  it('AGUARDAR só por Metrô paralisado: sem "melhor horário" (a janela é do tempo)', () => {
    const b = briefingCom(fixture('AGUARDAR'), {
      motivos: [{ dimensao: 'rail', severidade: 'AGUARDAR', regra: 'RN06', texto: 'Linha 2 paralisada' }],
    });
    expect(mostraMelhorHorario(b)).toBe(false);
  });
});

describe('MelhorHorario', () => {
  it('FAVORÁVEL: não aparece', async () => {
    await render(<MelhorHorario briefing={fixture('FAVORAVEL')} agora={AGORA} />);
    expect(screen.queryByTestId('melhor-horario')).toBeNull();
  });

  it('AGUARDAR: horário grande', async () => {
    await render(<MelhorHorario briefing={fixture('AGUARDAR')} agora={AGORA} />);
    expect(screen.getByText('11:00–12:00')).toBeTruthy();
  });

  it('sem janela: "Nenhum nas próximas 6 h"', async () => {
    await render(<MelhorHorario briefing={briefingCom(fixture('AGUARDAR'), { janelaMeteorologica: null })} agora={AGORA} />);
    expect(screen.getByText('Nenhum nas próximas 6 h')).toBeTruthy();
  });
});
