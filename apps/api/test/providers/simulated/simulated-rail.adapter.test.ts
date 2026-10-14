import { describe, expect, it } from 'vitest';
import { RailValueSchema } from '@kairos/contracts';
import { LINHAS_TRILHO_PADRAO, SimulatedRailAdapter } from '../../../src/providers/simulated/index.js';
import { FakeClock } from '../../infrastructure/helpers.js';
import { fonteControlada } from './helpers.js';

const signal = new AbortController().signal;

describe('SimulatedRailAdapter (T21)', () => {
  it('sem entrada: todas as linhas com fonte, todas NORMAL', async () => {
    const rail = new SimulatedRailAdapter({ fonte: fonteControlada(), clock: new FakeClock() });

    const valor = RailValueSchema.parse((await rail.fetch(undefined, { signal })).value);

    expect(valor.linhas.map((l) => l.linha)).toEqual([...LINHAS_TRILHO_PADRAO]);
    expect(valor.linhas.every((l) => l.situacao === 'NORMAL')).toBe(true);
  });

  it('a situação do cenário vale só para a primeira linha pedida ({ trilhos } ou { linhas })', async () => {
    const fonte = fonteControlada({
      rail: { tipo: 'valor', situacaoPrimeiraLinha: 'PARALISADA', statusTextoPrimeiraLinha: 'Operação Paralisada' },
    });
    const rail = new SimulatedRailAdapter({ fonte, clock: new FakeClock() });

    const doTrajeto = RailValueSchema.parse((await rail.fetch({ trilhos: ['L9', 'L4'] }, { signal })).value);
    const doReal = RailValueSchema.parse((await rail.fetch({ linhas: ['L2'] }, { signal })).value);

    expect(doTrajeto.linhas).toEqual([
      { linha: 'L9', statusTexto: 'Operação Paralisada', situacao: 'PARALISADA', detalhe: null, fonte: 'simulado:artesp' },
      { linha: 'L4', statusTexto: 'Operação Normal', situacao: 'NORMAL', detalhe: null, fonte: 'simulado:artesp' },
    ]);
    expect(doReal.linhas.map((l) => [l.linha, l.situacao, l.fonte])).toEqual([['L2', 'PARALISADA', 'simulado:metro-sp']]);
  });

  it('detalhe do cenário vai só para a primeira linha', async () => {
    const fonte = fonteControlada({
      rail: {
        tipo: 'valor',
        situacaoPrimeiraLinha: 'ALTERADA',
        statusTextoPrimeiraLinha: 'Maiores Intervalos',
        detalhePrimeiraLinha: 'Trens com maiores intervalos entre Barueri e Itapevi.',
      },
    });
    const rail = new SimulatedRailAdapter({ fonte, clock: new FakeClock() });
    const valor = RailValueSchema.parse((await rail.fetch({ trilhos: ['L8', 'L1'] }, { signal })).value);
    expect(valor.linhas.map((l) => l.detalhe)).toEqual(['Trens com maiores intervalos entre Barueri e Itapevi.', null]);
  });
});
