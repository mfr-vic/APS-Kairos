// O porquê de cada seção: o motivo que disparou, ou o limite respeitado, ou a causa da falta.
import { efeitoDaDimensao } from '@/features/briefing/efeito-dimensao';

import { briefingCom, fixture } from '../../support/briefing';
import { transito } from '../../support/transito';

const obs = (v: Parameters<typeof fixture>[0], d: string) =>
  fixture(v).observacoes.find((o) => o.dimension === d)!;

describe('efeitoDaDimensao', () => {
  it('com motivo da dimensão: tom da severidade e o texto da regra', () => {
    expect(efeitoDaDimensao(obs('AGUARDAR', 'weather'), fixture('AGUARDAR'))).toEqual({
      tom: 'erro',
      texto: 'Pesa no veredito: Chuva forte prevista às 09:00 (9,1 mm/h).',
    });
  });

  it('sem motivo: o limite respeitado', () => {
    expect(efeitoDaDimensao(obs('FAVORAVEL', 'bus'), fixture('FAVORAVEL'))).toEqual({
      tom: 'ok',
      texto: 'Chegada em até 20 min: não pesa no veredito.',
    });
  });

  it('ar sem média de 24 h: neutro, fora do veredito', () => {
    expect(efeitoDaDimensao(obs('FAVORAVEL', 'air'), fixture('FAVORAVEL'))).toEqual({
      tom: 'neutro',
      texto: 'Sem média de 24 h: o ar não entra no veredito.',
    });
  });

  it('indisponível: fora do veredito com a causa humana', () => {
    expect(efeitoDaDimensao(obs('INDETERMINADO', 'bus'), fixture('INDETERMINADO'))).toEqual({
      tom: 'neutro',
      texto: 'Fora do veredito: SPTrans falhou várias vezes seguidas; o servidor tenta de novo em instantes.',
    });
  });
});

describe('efeito do trânsito (RN09)', () => {
  const b = (motivos: Parameters<typeof briefingCom>[1]['motivos'] = []) =>
    briefingCom(fixture('FAVORAVEL'), { motivos, observacoes: [...fixture('FAVORAVEL').observacoes, transito()] });

  it('sem motivo: diz o limite respeitado', () => {
    const t = transito();
    expect(efeitoDaDimensao(t, b())).toEqual({ tom: 'ok', texto: 'Atraso abaixo de 15 min e sem trânsito intenso: não pesa no veredito.' });
  });

  it('RN09 com ônibus = pesa (Atenção); sem ônibus = INFORMATIVO, não muda o veredito', () => {
    const t = transito();
    expect(efeitoDaDimensao(t, b([{ dimensao: 'traffic', severidade: 'ATENCAO', regra: 'RN09', texto: 'Trânsito +16 min' }]))).toEqual({
      tom: 'atencao',
      texto: 'Pesa no veredito: Trânsito +16 min.',
    });
    expect(efeitoDaDimensao(t, b([{ dimensao: 'traffic', severidade: 'INFORMATIVO', regra: 'RN09', texto: 'Trânsito +16 min' }]))).toEqual({
      tom: 'neutro',
      texto: 'Não muda o veredito: Trânsito +16 min.',
    });
  });
});
