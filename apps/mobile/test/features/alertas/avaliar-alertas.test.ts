// Alertas calculados: limiares da B.8 + umidade/UV, resumos com números reais, ordem e selo.
import type { BriefingResponse, WeatherValue } from '@kairos/contracts';

import {
  avaliarAlertas,
  contarParaSelo,
  nivelPorTema,
  resumoAlertas,
  seloDaAba,
  type AlertaCalculado,
} from '@/features/alertas/avaliar-alertas';
import { FIXTURES_BRIEFING } from '@/features/briefing/fixtures';

import { comObservacao } from '../../support/briefing';
import { transito } from '../../support/transito';

const fixture = (veredito: BriefingResponse['veredito']) =>
  FIXTURES_BRIEFING.find((f) => f.briefing.veredito === veredito)!.briefing;

const clima = (atual: Partial<WeatherValue['atual']>, horas: WeatherValue['horas'] = []): WeatherValue => ({
  atual: { temperaturaC: 22, precipitacaoMm: 0, ventoKmH: 5, codigoTempo: 1, sensacaoC: 22, umidadePct: 60, uv: 2, ...atual },
  hoje: null,
  sol: null,
  horas,
});

// O exemplo oficial do contrato pode mudar de valores; fixamos o clima seco aqui.
function favoravelSeco(): BriefingResponse {
  const b = fixture('FAVORAVEL');
  return {
    ...b,
    observacoes: b.observacoes.map((o) =>
      o.dimension === 'weather' ? { ...o, value: clima({}) } : o
    ),
  };
}

describe('avaliarAlertas', () => {
  it('sem briefing nem tempo → nenhum alerta', () => {
    expect(avaliarAlertas(undefined, null)).toEqual([]);
  });

  it('FAVORÁVEL do contrato com tempo seco → nenhum alerta', () => {
    expect(avaliarAlertas(favoravelSeco(), null)).toEqual([]);
  });

  it('AGUARDAR: chuva forte às 09:00 e alagamento a 120 m, do mais grave', () => {
    const alertas = avaliarAlertas(fixture('AGUARDAR'), null);
    expect(alertas.map((a) => [a.id, a.nivel])).toEqual([
      ['chuva', 3],
      ['alagamento', 3],
    ]);
    expect(alertas[0]).toMatchObject({ titulo: 'Chuva forte', resumo: '9,1 mm/h às 09:00' });
    expect(alertas[1].resumo).toBe(
      '1 ponto histórico a até 300 m; o mais próximo a 120 m, com chuva de 9,1 mm/h às 09:00'
    );
    expect(contarParaSelo(alertas)).toBe(2);
  });

  it('ATENÇÃO: ar ruim (média 24 h) e ônibus sem previsão, nível 2', () => {
    const alertas = avaliarAlertas(fixture('ATENCAO'), null);
    expect(alertas.map((a) => a.id)).toEqual(['ar', 'trilho-L8', 'onibus-609']);
    expect(alertas[0].resumo).toBe('MP2,5 55,3 µg/m³ média 24 h (estimativa de modelo)');
    expect(alertas[2]).toMatchObject({ titulo: 'Ônibus 875A-10 sem previsão', resumo: 'Nenhum veículo transmitindo posição' });
  });

  it('só o tempo agora: chuva moderada (> 2,5) nível 2; ≤ 2,5 nada; forte (> 7,6) nível 3', () => {
    expect(avaliarAlertas(undefined, clima({ precipitacaoMm: 2.5 }))).toEqual([]);
    expect(avaliarAlertas(undefined, clima({ precipitacaoMm: 2.6 }))[0]).toMatchObject({
      nivel: 2,
      titulo: 'Chuva moderada',
      resumo: '2,6 mm/h agora',
    });
    const horas = [
      { hora: '2026-10-10T09:00:00-03:00', precipitacaoMm: 8, probabilidadePrecipitacao: 90, temperaturaC: 20 },
      { hora: '2026-10-10T10:00:00-03:00', precipitacaoMm: 1, probabilidadePrecipitacao: 50, temperaturaC: 20 },
      // 3ª hora fora da janela de 2 h da RN01: ignorada mesmo sendo a pior
      { hora: '2026-10-10T11:00:00-03:00', precipitacaoMm: 30, probabilidadePrecipitacao: 99, temperaturaC: 20 },
    ];
    expect(avaliarAlertas(undefined, clima({}, horas))[0]).toMatchObject({ nivel: 3, resumo: '8,0 mm/h às 09:00' });
  });

  it('alagamento sem chuva vira informativo (nível 0) e não conta no selo', () => {
    const briefing = fixture('AGUARDAR');
    const semChuva: BriefingResponse = {
      ...briefing,
      observacoes: briefing.observacoes.filter((o) => o.dimension !== 'weather'),
    };
    const alertas = avaliarAlertas(semChuva, null);
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({ id: 'alagamento', nivel: 0 });
    expect(contarParaSelo(alertas)).toBe(0);
  });

  it('trilho PARALISADA nível 3 (com o texto da fonte), ALTERADA nível 2; ônibus > 20 min nível 2', () => {
    const base = favoravelSeco();
    const briefing: BriefingResponse = {
      ...base,
      observacoes: base.observacoes.map((o) => {
        if (o.dimension === 'rail')
          return {
            ...o,
            value: {
              linhas: [
                { linha: 'L4', statusTexto: 'Operação Encerrada', situacao: 'PARALISADA', detalhe: null, fonte: 'artesp' },
                { linha: 'L1', statusTexto: 'Velocidade Reduzida', situacao: 'ALTERADA', detalhe: null, fonte: 'metro-sp' },
              ],
            },
          };
        if (o.dimension === 'bus')
          return { ...o, value: { ...o.value!, linhas: [{ ...o.value!.linhas[0], minutosAteChegada: 35 }] } };
        return o;
      }),
    };
    const alertas = avaliarAlertas(briefing, null);
    expect(alertas.map((a) => [a.titulo, a.nivel, a.resumo])).toEqual([
      ['Linha 4 paralisada', 3, 'ARTESP · ViaQuatro: “Operação Encerrada”.'],
      ['Linha 1 com operação alterada', 2, 'Direto do Metrô: “Velocidade Reduzida”.'],
      ['Ônibus 875A-10 demorando', 2, 'chega em 35 min'],
    ]);
    // Conselho cita a operadora certa de cada linha (não mais "Metrô/CPTM" para todas).
    expect(alertas[0].conselho).toBe('Confirme nos canais oficiais da ViaQuatro e considere um caminho alternativo.');
    expect(alertas[1].conselho).toBe('Confirme nos canais oficiais do Metrô e considere um caminho alternativo.');
  });

  it('ARTESP: linha alterada traz a explicação da operadora no resumo (spike de 13/10)', () => {
    const l8 = avaliarAlertas(fixture('ATENCAO'), null).find((a) => a.id === 'trilho-L8');
    expect(l8).toMatchObject({
      nivel: 2,
      resumo:
        'ARTESP · ViaMobilidade 8 e 9: “Maiores Intervalos”. Devido à atividade de manutenção programada, os trens da Linha 8-Diamante circulam com maiores intervalos entre as estações Barueri e Itapevi.',
      conselho: 'Confirme nos canais oficiais da ViaMobilidade 8 e 9 e considere um caminho alternativo.',
    });
  });

  it('umidade (< 30/20/12 %) e UV (≥ 6/8/11) pelos limiares; UV < 6 não gera alerta', () => {
    expect(avaliarAlertas(undefined, clima({ umidadePct: 25, uv: 5.9 }))).toEqual([
      expect.objectContaining({ id: 'umidade', nivel: 1, titulo: 'Umidade baixa (atenção)', resumo: 'Umidade relativa 25 %' }),
    ]);
    const graves = avaliarAlertas(undefined, clima({ umidadePct: 11, uv: 11 }));
    expect(graves.map((a) => [a.id, a.nivel])).toEqual([
      ['umidade', 3],
      ['uv', 3],
    ]);
    expect(graves[1]).toMatchObject({ titulo: 'UV extremo', resumo: 'Índice UV 11,0' });
    expect(avaliarAlertas(undefined, clima({ umidadePct: 19, uv: 8 })).map((a) => a.nivel)).toEqual([2, 2]);
  });

  it('campos nulos no tempo agora não geram alerta', () => {
    expect(avaliarAlertas(undefined, clima({ umidadePct: null, uv: null }))).toEqual([]);
  });
});

// Regressão (prints do aparelho, 13/10): selo "0" visível na aba Alertas.
describe('seloDaAba', () => {
  it('0 → oculto e SEM texto (o NativeTabs ignora hidden quando há texto)', () => {
    expect(seloDaAba(0)).toEqual({ hidden: true, texto: undefined });
  });
  it('2 → visível com "2"', () => {
    expect(seloDaAba(2)).toEqual({ hidden: false, texto: '2' });
  });
});

const al = (id: string, nivel: 0 | 1 | 2 | 3, titulo = id): AlertaCalculado => ({
  id,
  nivel,
  titulo,
  resumo: `resumo ${id}`,
  conselho: 'c',
});

// Regressão (13/10): "Tudo tranquilo" logo acima de um aviso informativo de alagamento.
describe('resumoAlertas', () => {
  it('nenhum alerta → "Sem alertas agora"', () => {
    expect(resumoAlertas([])).toMatchObject({ titulo: 'Sem alertas agora', tom: 'ok' });
  });
  it('só informativo → conta o aviso em vez de "tudo tranquilo"', () => {
    expect(resumoAlertas([al('alagamento', 0, 'Pontos de alagamento no trajeto')])).toEqual({
      titulo: 'Sem alertas de risco · 1 aviso informativo',
      texto: 'Veja abaixo: pontos de alagamento no trajeto.',
      tom: 'neutro',
    });
  });
  it('risco + informativos → conta os dois e cita o mais grave com o dado', () => {
    const r = resumoAlertas([al('chuva', 3, 'Chuva forte'), al('ar', 2), al('alagamento', 0), al('uv', 0)]);
    expect(r).toEqual({
      titulo: '2 alertas ativos · 2 avisos informativos',
      texto: 'Mais importante agora: Chuva forte (resumo chuva).',
      tom: 'erro',
    });
  });
});

describe('nivelPorTema', () => {
  it('agrupa trilho-*/onibus-* pelo tema do "Saiba mais" e guarda o maior nível', () => {
    expect(nivelPorTema([al('trilho-L4', 2), al('trilho-L1', 3), al('onibus-609', 2), al('alagamento', 0)])).toEqual({
      trilhos: 3,
      onibus: 2,
      alagamento: 0,
    });
  });
});

describe('alerta de trânsito (RF22, RN09)', () => {
  it('só quando pesa: intenso = atenção (1), parado = alerta (2), moderado curto = nada', () => {
    const intenso = avaliarAlertas(comObservacao(favoravelSeco(), transito({ nivel: 'INTENSO', atrasoS: 12 * 60 })), null);
    expect(intenso.find((a) => a.id === 'transito')).toMatchObject({
      nivel: 1,
      titulo: 'Trânsito intenso no trajeto',
      resumo: '+12 min: 28 min agora · 22 min sem trânsito',
    });
    const parado = avaliarAlertas(comObservacao(favoravelSeco(), transito({ nivel: 'PARADO', atrasoS: 30 * 60 })), null);
    expect(parado.find((a) => a.id === 'transito')?.nivel).toBe(2);
    const leve = avaliarAlertas(comObservacao(favoravelSeco(), transito()), null);
    expect(leve.find((a) => a.id === 'transito')).toBeUndefined();
  });
});
