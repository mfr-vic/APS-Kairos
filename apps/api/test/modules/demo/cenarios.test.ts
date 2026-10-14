import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DimensionSchema } from '@kairos/contracts';
import { CENARIOS, NOMES_CENARIO, type NomeCenario } from '../../../src/modules/demo/index.js';
import { briefingSimulado, montarDemo } from './helpers.js';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  vi.useRealTimers();
});

const simulados = NOMES_CENARIO.filter((nome) => CENARIOS[nome].esperado !== null);

describe('Catálogo de cenários (T21, RF19)', () => {
  it('só o cenário `real` não tem simulação nem resultado esperado', () => {
    expect(NOMES_CENARIO.filter((n) => CENARIOS[n].simulacao === null)).toEqual(['real']);
    expect(simulados).toHaveLength(NOMES_CENARIO.length - 1);
  });

  it.each(simulados)('%s: simulados → ProviderRunner → regras produzem o resultado esperado', async (nome: NomeCenario) => {
    const demo = montarDemo();
    demo.cenario.ativar(nome);
    const esperado = CENARIOS[nome].esperado!;

    const briefing = await briefingSimulado(demo);

    expect(briefing.veredito).toBe(esperado.veredito);
    expect(briefing.confianca.nivel).toBe(esperado.confianca);
    expect(briefing.motivos.map((m) => m.regra)).toEqual(esperado.regras);
    const estados = Object.fromEntries(briefing.observacoes.map((o) => [o.dimension, o.status]));
    for (const dimensao of DimensionSchema.options) {
      expect(estados[dimensao], dimensao).toBe(esperado.estados[dimensao] ?? 'fresh');
    }
    // Nenhum dado simulado é atribuído a uma fonte real
    expect(briefing.observacoes.every((o) => o.source.startsWith('simulado:'))).toBe(true);
  });
});

describe('TC24 e cenários de falha pelo catálogo', () => {
  it('chuva-forte → AGUARDAR (RN01) e a janela aponta a primeira hora com chuva ≤ 2,5 mm/h', async () => {
    const demo = montarDemo();
    demo.cenario.ativar('chuva-forte');

    const briefing = await briefingSimulado(demo);

    expect(briefing.veredito).toBe('AGUARDAR');
    expect(briefing.motivos[0]?.texto).toBe('Chuva forte prevista (12,0 mm/h às 19h)');
    expect(briefing.janela).toEqual({ inicio: '2026-10-10T21:00:00-03:00', fim: '2026-10-10T22:00:00-03:00' });
  });

  it('trilho-intervalos: a linha traz "Maiores Intervalos" com o detalhe da fonte (atrasos e obstáculos)', async () => {
    const demo = montarDemo();
    demo.cenario.ativar('trilho-intervalos');

    const briefing = await briefingSimulado(demo);

    const rail = briefing.observacoes.find((o) => o.dimension === 'rail');
    expect(rail?.value?.linhas[0]).toMatchObject({
      linha: 'L1',
      statusTexto: 'Maiores Intervalos',
      situacao: 'ALTERADA',
      detalhe: expect.stringMatching(/maiores intervalos/),
      fonte: 'simulado:metro-sp',
    });
    expect(briefing.motivos[0]).toMatchObject({ regra: 'RN06', severidade: 'ATENCAO' });
  });

  it('TC12 sptrans-fora: ônibus unavailable com motivo, confiança ≤ MÉDIA, sem exceção', async () => {
    const demo = montarDemo();
    demo.cenario.ativar('sptrans-fora');

    const briefing = await briefingSimulado(demo);

    const bus = briefing.observacoes.find((o) => o.dimension === 'bus');
    expect(bus).toMatchObject({ status: 'unavailable', value: null, motivo: 'A fonte respondeu com erro (HTTP 503)' });
    expect(['MEDIA', 'BAIXA']).toContain(briefing.confianca.nivel);
    expect(briefing.confianca.explicacao).toContain('Sem dados de ônibus');
  });

  it('TC15 dados-obsoletos: clima e ônibus stale, confiança MÉDIA citando os dois', async () => {
    const demo = montarDemo();
    demo.cenario.ativar('dados-obsoletos');

    const briefing = await briefingSimulado(demo);

    expect(briefing.confianca).toEqual({ nivel: 'MEDIA', explicacao: 'Dados desatualizados de clima e ônibus' });
    const clima = briefing.observacoes.find((o) => o.dimension === 'weather');
    expect(clima?.motivo).toBe('Dado da fonte com 30 min de idade');
  });

  it('TC14 resposta-invalida: log de validação (schema) no clima e invalid-json no ar', async () => {
    const demo = montarDemo();
    demo.cenario.ativar('resposta-invalida');

    await briefingSimulado(demo);

    const falhas = demo.logger.lines.filter((l) => l.msg === 'falha no provedor').map((l) => l.obj);
    expect(falhas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: 'simulado:open-meteo', erro: 'schema' }),
        expect.objectContaining({ provider: 'simulado:open-meteo-air-quality', erro: 'invalid-json' }),
      ]),
    );
  });

  it('TC13 clima-lento: o briefing fica pronto com 3 s de relógio falso; clima unavailable por timeout', async () => {
    const demo = montarDemo();
    demo.cenario.ativar('clima-lento');

    const briefing = await briefingSimulado(demo);

    expect(briefing.observacoes.find((o) => o.dimension === 'weather')).toMatchObject({
      status: 'unavailable',
      motivo: 'A fonte não respondeu a tempo',
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('TC24 em sequência no mesmo runner (como na apresentação): o veredito acompanha cada troca', async () => {
    const demo = montarDemo();
    const sequencia: [NomeCenario, string][] = [
      ['normal', 'FAVORAVEL'],
      ['chuva-forte', 'AGUARDAR'],
      ['sptrans-fora', 'FAVORAVEL'],
      ['dados-obsoletos', 'FAVORAVEL'],
      ['resposta-invalida', 'FAVORAVEL'],
      ['tudo-fora', 'INDETERMINADO'],
      ['normal', 'FAVORAVEL'],
    ];
    const vistos: string[] = [];
    for (const [nome] of sequencia) {
      demo.cenario.ativar(nome);
      const briefing = await briefingSimulado(demo);
      vistos.push(briefing.veredito);
      demo.clock.advance(1_000);
    }
    expect(vistos).toEqual(sequencia.map(([, v]) => v));
  });
});
