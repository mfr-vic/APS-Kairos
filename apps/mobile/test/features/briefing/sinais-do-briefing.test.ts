// Sinais curtos do herói e dos cartões: do mais grave ao mais tranquilo, só com dados reais.
import { sinaisDoBriefing } from '@/features/briefing/sinais-do-briefing';

import { AGORA, comObservacao, fixture, onibus, trilhos } from '../../support/briefing';
import { transito } from '../../support/transito';

describe('sinaisDoBriefing', () => {
  it('AGUARDAR: chuva forte e alagamento primeiro (erro), Metrô sem dados (neutro), ar bom (ok)', () => {
    expect(sinaisDoBriefing(fixture('AGUARDAR'), AGORA).map((s) => [s.tom, s.texto])).toEqual([
      ['erro', 'Chuva forte às 09:00'],
      ['erro', 'Alagamento a 120 m'],
      ['neutro', 'Metrô e trem sem dados'],
      ['ok', 'Ar bom'],
    ]);
  });

  it('FAVORÁVEL do contrato: ônibus com minutos, Metrô normal, sem chuva, sem alagamento', () => {
    const textos = sinaisDoBriefing(fixture('FAVORAVEL'), AGORA).map((s) => s.texto);
    expect(textos).toEqual(['875A-10 em 10 min', 'Linha 4 normal', 'Sem chuva prevista', 'Sem alagamento no caminho']);
  });

  it('linha paralisada é erro; ônibus sem previsão é atenção', () => {
    const b = comObservacao(
      comObservacao(fixture('FAVORAVEL'), trilhos([{ linha: 'L4', situacao: 'PARALISADA', statusTexto: 'x' }])),
      onibus([{ letreiro: '875A-10', codigoLinha: 609, proximaChegada: null }])
    );
    const s = sinaisDoBriefing(b, AGORA);
    expect(s[0]).toMatchObject({ tom: 'erro', texto: 'Linha 4 paralisada' });
    expect(s.find((x) => x.dimensao === 'bus')).toMatchObject({ tom: 'atencao', texto: '875A-10 sem previsão' });
  });
});

describe('sinal de trânsito (RF22)', () => {
  it('atraso vira "+N min" em atenção quando pesa (RN09); sem atraso, "Trânsito livre"', () => {
    const pesado = sinaisDoBriefing(comObservacao(fixture('FAVORAVEL'), transito({ atrasoS: 16 * 60, nivel: 'MODERADO' })), AGORA);
    expect(pesado.find((s) => s.dimensao === 'traffic')).toMatchObject({ tom: 'atencao', texto: 'Trânsito +16 min' });
    const livre = sinaisDoBriefing(comObservacao(fixture('FAVORAVEL'), transito({ atrasoS: 10, nivel: 'LIVRE' })), AGORA);
    expect(livre.find((s) => s.dimensao === 'traffic')).toMatchObject({ tom: 'ok', texto: 'Trânsito livre' });
  });
});
