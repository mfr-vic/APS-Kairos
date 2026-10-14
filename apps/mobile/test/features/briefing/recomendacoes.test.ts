// "O que fazer agora" e a ação do herói: só o que os dados sustentam, com verbo + dado + horário.
import { acaoPrincipal, juntar, recomendacoes } from '@/features/briefing/recomendacoes';

import { AGORA, briefingCom, clima, comObservacao, fixture, onibus, trilhos } from '../../support/briefing';
import { transito } from '../../support/transito';

const favoravel = fixture('FAVORAVEL');

describe('acaoPrincipal', () => {
  it('FAVORÁVEL com ônibus: "Saia agora" + a chegada com hora e minutos', () => {
    const b = comObservacao(
      favoravel,
      onibus([{ letreiro: '875A-10', codigoLinha: 609, proximaChegada: '2026-10-10T08:16:00-03:00' }])
    );
    expect(acaoPrincipal(b, AGORA)).toEqual({
      titulo: 'Saia agora',
      detalhe: '875A-10 chega às 08:16 (em 6 min)',
    });
  });

  it('FAVORÁVEL sem ônibus utilizável: diz a chuva das próximas 2 h', () => {
    const b = briefingCom(favoravel, {
      observacoes: favoravel.observacoes.filter((o) => o.dimension !== 'bus'),
    });
    expect(acaoPrincipal(b, AGORA).detalhe).toBe('Sem chuva prevista nas próximas 2 h');
  });

  it('AGUARDAR por chuva com janela: "Espere até HH:MM" + o motivo', () => {
    expect(acaoPrincipal(fixture('AGUARDAR'), AGORA)).toEqual({
      titulo: 'Espere até 11:00',
      detalhe: 'Chuva forte prevista às 09:00 (9,1 mm/h)',
    });
  });

  it('AGUARDAR por linha paralisada NÃO promete horário (a janela é só do tempo)', () => {
    const b = briefingCom(fixture('AGUARDAR'), {
      motivos: [{ dimensao: 'rail', severidade: 'AGUARDAR', regra: 'RN06', texto: 'Linha 4-Amarela paralisada' }],
    });
    expect(acaoPrincipal(b, AGORA)).toEqual({ titulo: 'Aguarde ou mude o caminho', detalhe: 'Linha 4-Amarela paralisada' });
  });

  // Regressão (13/10, print do aparelho): "Indeterminado" sem dizer por quê nem o que fazer.
  it('INDETERMINADO: diz quais fontes falharam, a causa com o nome da fonte e o que fazer', () => {
    expect(acaoPrincipal(fixture('INDETERMINADO'), AGORA)).toEqual({
      titulo: 'Sem dados para decidir',
      detalhe: 'Clima, Ônibus e Metrô e trem sem dados: Open-Meteo não respondeu em 3 s. Tente de novo em instantes',
    });
  });
});

describe('recomendacoes', () => {
  it('ônibus: pega a linha mais próxima, oferece a alternativa vinculada e avisa a sem previsão', () => {
    const b = comObservacao(
      favoravel,
      onibus([
        { letreiro: '875A-10', codigoLinha: 609, proximaChegada: '2026-10-10T08:16:00-03:00' },
        { letreiro: '701U-10', codigoLinha: 700, proximaChegada: '2026-10-10T08:25:00-03:00' },
        { letreiro: '609F-10', codigoLinha: 800, proximaChegada: null },
      ])
    );
    const r = recomendacoes(b, AGORA);
    const porId = Object.fromEntries(r.map((x) => [x.id, x]));
    expect(porId['onibus-609']).toMatchObject({
      tom: 'seguir',
      titulo: 'Pegue o 875A-10 das 08:16',
      texto: 'Chega em 6 min em CAIO PRADO B/C. É a mais próxima das 3 linhas vinculadas.',
    });
    expect(porId['onibus-alt-700']).toMatchObject({
      titulo: 'Alternativa: 701U-10 às 08:25',
      texto: 'Mesmo ponto, 9 min depois do 875A-10.',
    });
    expect(porId['onibus-sem-800']).toMatchObject({ tom: 'atencao', titulo: 'Confira o 609F-10 no ponto' });
    // Mais urgente primeiro.
    expect(r[0].tom).toBe('atencao');
  });

  it('ônibus a mais de 20 min: atenção e "saia perto das HH:MM"', () => {
    const b = comObservacao(
      favoravel,
      onibus([{ letreiro: '875A-10', codigoLinha: 609, proximaChegada: '2026-10-10T08:45:00-03:00' }])
    );
    expect(recomendacoes(b, AGORA)[0]).toMatchObject({
      tom: 'atencao',
      titulo: 'Saia perto das 08:45: 875A-10 só em 35 min',
    });
  });

  it('Metrô: linha alterada com outra vinculada normal sugere a outra (alternativa real)', () => {
    const b = comObservacao(
      favoravel,
      trilhos([
        { linha: 'L4', situacao: 'ALTERADA', statusTexto: 'Velocidade Reduzida' },
        { linha: 'L1', situacao: 'NORMAL', statusTexto: 'Operação Normal' },
      ])
    );
    expect(recomendacoes(b, AGORA).find((x) => x.id === 'trilho-L4')).toMatchObject({
      tom: 'atencao',
      titulo: 'Conte com atraso na Linha 4-Amarela',
      texto: 'Linha 1-Azul, também do seu trajeto, opera normalmente.',
    });
  });

  it('trilho: paralisada sem alternativa → evitar e confirmar com a operadora da linha', () => {
    const b = comObservacao(favoravel, trilhos([{ linha: 'L4', situacao: 'PARALISADA', statusTexto: 'Operação Encerrada' }]));
    expect(recomendacoes(b, AGORA)[0]).toMatchObject({
      tom: 'evitar',
      titulo: 'Evite a Linha 4-Amarela',
      texto: 'ARTESP · ViaQuatro: “Operação Encerrada”. Confirme nos canais oficiais da ViaQuatro antes de sair.',
    });
  });

  it('ARTESP: alterada com alternativa leva a explicação da operadora antes da alternativa', () => {
    expect(recomendacoes(fixture('ATENCAO'), AGORA).find((x) => x.id === 'trilho-L8')).toMatchObject({
      tom: 'atencao',
      titulo: 'Conte com atraso na Linha 8-Diamante',
      texto:
        'Devido à atividade de manutenção programada, os trens da Linha 8-Diamante circulam com maiores intervalos entre as estações Barueri e Itapevi. Linha 9-Esmeralda, também do seu trajeto, opera normalmente.',
    });
  });

  it('trilhos normais de fontes diferentes: cita as duas (source artesp+metro-sp)', () => {
    const b = comObservacao(
      favoravel,
      trilhos([
        { linha: 'L1', situacao: 'NORMAL', statusTexto: 'Operação Normal' },
        { linha: 'L8', situacao: 'NORMAL', statusTexto: 'Operação Normal' },
      ])
    );
    expect(recomendacoes(b, AGORA).find((x) => x.id === 'trilho-normal')).toMatchObject({
      titulo: 'Metrô e trem operando normalmente',
      texto: 'Linha 1 e Linha 8 sem alteração segundo Direto do Metrô e ARTESP.',
    });
  });

  it('chuva: 60% de chance às 09:00 → "Leve guarda-chuva" (decisão de projeto: ≥ 40%)', () => {
    const b = comObservacao(favoravel, clima([{ h: '09', mm: 0.4, p: 60 }, { h: '10', mm: 0.1, p: 20 }]));
    expect(recomendacoes(b, AGORA).find((x) => x.id === 'chuva')).toMatchObject({
      tom: 'atencao',
      titulo: 'Leve guarda-chuva',
      texto: '60% de chance de chuva às 09:00 (até 0,4 mm/h).',
    });
  });

  it('chuva forte: evitar, com a hora firme da janela', () => {
    expect(recomendacoes(fixture('AGUARDAR'), AGORA).find((x) => x.id === 'chuva')).toMatchObject({
      tom: 'evitar',
      titulo: 'Evite sair com a chuva forte às 09:00',
      texto: '9,1 mm/h previstos. Tempo firme a partir das 11:00.',
    });
  });

  it('alagamento com chuva > 2,5 mm/h: não atravesse, com a distância real', () => {
    expect(recomendacoes(fixture('AGUARDAR'), AGORA).find((x) => x.id === 'alagamento')).toMatchObject({
      tom: 'evitar',
      titulo: 'Não atravesse áreas alagadas a 120 m do trajeto',
    });
  });

  it('ar ruim (média 24 h > 50): evitar esforço, com o número e "estimativa de modelo"', () => {
    const ar = recomendacoes(fixture('ATENCAO'), AGORA).find((x) => x.id === 'ar');
    expect(ar?.texto).toMatch(/^MP2,5 com média de 55,3 µg\/m³ em 24 h \(estimativa de modelo\)/);
  });

  it('sem nenhuma observação: lista vazia (nada inventado)', () => {
    expect(recomendacoes(briefingCom(favoravel, { observacoes: [] }), AGORA)).toEqual([]);
  });
});

describe('juntar', () => {
  it('"A", "A e B", "A, B e C"', () => {
    expect(juntar(['A'])).toBe('A');
    expect(juntar(['A', 'B'])).toBe('A e B');
    expect(juntar(['A', 'B', 'C'])).toBe('A, B e C');
  });
});

describe('recomendação de trânsito (RF22)', () => {
  it('só quando pesa (RN09): conta com o atraso, com tempos da TomTom', () => {
    const pesado = comObservacao(favoravel, transito({ nivel: 'INTENSO', atrasoS: 12 * 60, duracaoAtualS: 34 * 60, duracaoLivreS: 22 * 60 }));
    expect(recomendacoes(pesado, AGORA).find((r) => r.id === 'transito')).toMatchObject({
      tom: 'atencao',
      titulo: 'Conte com +12 min de trânsito',
      texto: expect.stringContaining('34 min agora; sem trânsito, 22 min (TomTom)'),
    });
    const leve = comObservacao(favoravel, transito({ nivel: 'MODERADO', atrasoS: 5 * 60 }));
    expect(recomendacoes(leve, AGORA).find((r) => r.id === 'transito')).toBeUndefined();
  });
});
