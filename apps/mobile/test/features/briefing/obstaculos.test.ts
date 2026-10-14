// "Atrasos e obstáculos": fatos do trajeto e fontes que falharam, ditos em linguagem humana.
import { obstaculos, resumoSemObstaculos } from '@/features/briefing/obstaculos';

import { AGORA, briefingCom, comObservacao, fixture, onibus, trilhos } from '../../support/briefing';
import { transito } from '../../support/transito';

describe('obstaculos', () => {
  it('AGUARDAR: alagamento com chuva (erro) e Metrô indisponível com a causa', () => {
    const r = obstaculos(fixture('AGUARDAR'), AGORA);
    expect(r.map((o) => o.titulo)).toEqual(['Alagamento possível a 120 m do trajeto', 'Metrô e trem: sem dados agora']);
    expect(r[0].texto).toBe('Ponto histórico com chuva de 9,1 mm/h às 09:00.');
    expect(r[1].texto).toBe('Página do Metrô respondeu HTTP 503. O veredito foi calculado sem o metrô e o trem.');
  });

  it('ônibus > 20 min, sem previsão e linha alterada (com o texto da fonte)', () => {
    const b = comObservacao(
      comObservacao(
        fixture('FAVORAVEL'),
        onibus([
          { letreiro: '875A-10', codigoLinha: 609, proximaChegada: '2026-10-10T08:40:00-03:00' },
          { letreiro: '701U-10', codigoLinha: 700, proximaChegada: null },
        ])
      ),
      trilhos([{ linha: 'L4', situacao: 'ALTERADA', statusTexto: 'Velocidade Reduzida' }])
    );
    const r = obstaculos(b, AGORA);
    expect(r.map((o) => o.titulo)).toEqual([
      '875A-10 só às 08:40',
      '701U-10 sem previsão de chegada',
      'Linha 4-Amarela com operação alterada',
    ]);
    expect(r[0].texto).toBe('Chega em 30 min em CAIO PRADO B/C: espera acima de 20 min.');
    expect(r[2].texto).toBe('ARTESP · ViaQuatro: “Velocidade Reduzida”.');
  });

  it('ARTESP: texto da fonte + explicação da operadora (L8 do spike de 13/10), sem paráfrase', () => {
    const l8 = obstaculos(fixture('ATENCAO'), AGORA).find((o) => o.id === 'trilho-L8');
    expect(l8).toMatchObject({
      tom: 'atencao',
      titulo: 'Linha 8-Diamante com operação alterada',
      texto:
        'ARTESP · ViaMobilidade 8 e 9: “Maiores Intervalos”. Devido à atividade de manutenção programada, os trens da Linha 8-Diamante circulam com maiores intervalos entre as estações Barueri e Itapevi.',
    });
  });

  it('L4 com a ARTESP fora cai na página do Metrô: cita a fonte daquela linha', () => {
    const b = comObservacao(
      fixture('FAVORAVEL'),
      trilhos([{ linha: 'L4', situacao: 'PARALISADA', statusTexto: 'Operação Paralisada', fonte: 'metro-sp' }])
    );
    expect(obstaculos(b, AGORA)[0]).toMatchObject({
      titulo: 'Linha 4-Amarela paralisada',
      texto: 'Direto do Metrô: “Operação Paralisada”.',
    });
  });

  it('dado desatualizado (stale) aparece com a idade e o motivo com nome da fonte', () => {
    const b = comObservacao(
      fixture('FAVORAVEL'),
      onibus([{ letreiro: '875A-10', codigoLinha: 609, proximaChegada: '2026-10-10T08:16:00-03:00' }], {
        status: 'stale',
        observedAt: '2026-10-10T08:08:00-03:00',
        motivo: 'A fonte não respondeu a tempo; usando dado de 2 min atrás',
      })
    );
    expect(obstaculos(b, AGORA)).toContainEqual(
      expect.objectContaining({
        titulo: 'Ônibus: dado há 2 min',
        texto: 'SPTrans não respondeu a tempo; mostrando o dado de 2 min atrás.',
      })
    );
  });

  it('FAVORÁVEL do contrato: nada a relatar', () => {
    expect(obstaculos(fixture('FAVORAVEL'), AGORA)).toEqual([]);
  });
});

describe('resumoSemObstaculos', () => {
  it('afirma só o que foi verificado', () => {
    expect(resumoSemObstaculos(fixture('FAVORAVEL'))).toBe(
      'Ônibus chegando em até 20 min, metrô e trem sem alteração e nenhum alagamento no caminho.'
    );
    expect(resumoSemObstaculos(briefingCom(fixture('FAVORAVEL'), { observacoes: [] }))).toBe(
      'As fontes que responderam não indicam atraso nem bloqueio.'
    );
  });
});

describe('obstáculo de trânsito (RF22)', () => {
  it('trânsito intenso entra com atraso, tempos e trechos lentos', () => {
    const b = comObservacao(fixture('FAVORAVEL'), transito({ nivel: 'INTENSO', atrasoS: 12 * 60, duracaoAtualS: 34 * 60, duracaoLivreS: 22 * 60 }));
    expect(obstaculos(b, AGORA).find((o) => o.id === 'transito')).toEqual({
      id: 'transito',
      tom: 'atencao',
      icone: 'rota',
      titulo: 'Trânsito intenso: +12 min',
      texto: 'De carro ou ônibus: 34 min agora · 22 min sem trânsito · 1 trecho lento.',
    });
  });

  it('trânsito livre não é obstáculo', () => {
    const b = comObservacao(fixture('FAVORAVEL'), transito({ nivel: 'LIVRE', atrasoS: 30 }));
    expect(obstaculos(b, AGORA).find((o) => o.id === 'transito')).toBeUndefined();
  });

  it('TomTom fora do ar aparece com o nome da fonte', () => {
    const b = comObservacao(fixture('FAVORAVEL'), transito({}, { status: 'unavailable', value: null, observedAt: null, fetchedAt: null, motivo: 'A fonte não respondeu a tempo' }));
    expect(obstaculos(b, AGORA).find((o) => o.id === 'fonte-traffic')).toMatchObject({
      titulo: 'Trânsito: sem dados agora',
      texto: 'TomTom não respondeu a tempo. O veredito foi calculado sem o trânsito.',
    });
  });
});
