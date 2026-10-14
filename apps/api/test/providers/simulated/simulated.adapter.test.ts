import { afterEach, describe, expect, it, vi } from 'vitest';
import { ObservationSchema } from '@kairos/contracts';
import {
  CORPO_MALFORMADO,
  SimulatedBusAdapter,
  SimulatedWeatherAdapter,
} from '../../../src/providers/simulated/index.js';
import { fonteControlada, setupRunner } from './helpers.js';

const SP = { lat: -23.5505, lon: -46.6333 };

afterEach(() => {
  vi.useRealTimers();
});

describe('SimulatedAdapter (T21) passando pelo ProviderRunner', () => {
  it('valor normal → fresh, no contrato, com source "simulado:…"', async () => {
    const { clock, runner, logger } = setupRunner();
    const weather = new SimulatedWeatherAdapter({ fonte: fonteControlada(), clock });

    const obs = ObservationSchema.parse(await runner.observe(weather, SP, { logger }));

    expect(obs).toMatchObject({ dimension: 'weather', source: 'simulado:open-meteo', status: 'fresh', ttlSeconds: 900 });
    expect(obs.observedAt).toBe(new Date(clock.now()).toISOString());
    expect(weather.chamadas).toBe(1);
  });

  it('TC15: idadeSegundos recua o observedAt → stale entre TTL e 3×TTL; acima → unavailable', async () => {
    const { clock, runner, logger } = setupRunner();
    const fonte = fonteControlada({ weather: { tipo: 'valor', idadeSegundos: 30 * 60 } });
    const weather = new SimulatedWeatherAdapter({ fonte, clock });

    const stale = ObservationSchema.parse(await runner.observe(weather, SP, { logger }));
    expect(stale.status).toBe('stale');
    expect(stale.observedAt).toBe(new Date(clock.now() - 30 * 60_000).toISOString());
    expect(stale.motivo).toBe('Dado da fonte com 30 min de idade');

    fonte.estado.simulacao = { weather: { tipo: 'valor', idadeSegundos: 46 * 60 } };
    fonte.estado.chave = 'teste#1';
    const velho = ObservationSchema.parse(await runner.observe(weather, SP, { logger }));
    expect(velho.status).toBe('unavailable');
    expect(velho.value).toBeNull();
  });

  it('TC12: falha → unavailable com motivo HTTP 503, sem lançar', async () => {
    const { clock, runner, logger } = setupRunner();
    const bus = new SimulatedBusAdapter({ fonte: fonteControlada({ bus: { tipo: 'falha' } }), clock });

    const obs = ObservationSchema.parse(await runner.observe(bus, {}, { logger }));

    expect(obs).toMatchObject({ dimension: 'bus', source: 'simulado:sptrans-olhovivo', status: 'unavailable', value: null });
    expect(obs.motivo).toBe('A fonte respondeu com erro (HTTP 503)');
  });

  it('TC18: sempre falhando, 5 briefings seguidos → breaker abre após o 3º; contador de chamadas = 3', async () => {
    const { clock, runner, logger } = setupRunner();
    const bus = new SimulatedBusAdapter({ fonte: fonteControlada({ bus: { tipo: 'falha' } }), clock });

    for (let i = 0; i < 5; i++) {
      const obs = await runner.observe(bus, {}, { logger });
      expect(obs.status).toBe('unavailable');
      clock.advance(1_000);
    }

    expect(bus.chamadas).toBe(3);
    expect(runner.breakerFor('simulado:sptrans-olhovivo').state).toBe('open');
    const erros = logger.lines.filter((l) => l.msg === 'falha no provedor').map((l) => l.obj.erro);
    expect(erros).toEqual(['http-status', 'http-status', 'http-status', 'circuit-open', 'circuit-open']);
  });

  it('TC14: JSON malformado → unavailable e log com erro invalid-json e o trecho', async () => {
    const { clock, runner, logger } = setupRunner();
    const weather = new SimulatedWeatherAdapter({ fonte: fonteControlada({ weather: { tipo: 'json-malformado' } }), clock });

    const obs = ObservationSchema.parse(await runner.observe(weather, SP, { logger }));

    expect(obs.status).toBe('unavailable');
    expect(obs.motivo).toBe('A fonte respondeu em formato inesperado');
    const falha = logger.lines.find((l) => l.msg === 'falha no provedor');
    expect(falha?.level).toBe('warn');
    expect(falha?.obj).toMatchObject({ erro: 'invalid-json', trecho: CORPO_MALFORMADO });
  });

  it('TC14: campo faltando → o runner rejeita no schema; log com o caminho do campo', async () => {
    const { clock, runner, logger } = setupRunner();
    const weather = new SimulatedWeatherAdapter({ fonte: fonteControlada({ weather: { tipo: 'campo-faltando' } }), clock });

    const obs = ObservationSchema.parse(await runner.observe(weather, SP, { logger }));

    expect(obs.status).toBe('unavailable');
    const falha = logger.lines.find((l) => l.msg === 'falha no provedor');
    expect(falha?.obj.erro).toBe('schema');
    expect(falha?.obj.issues).toEqual([expect.objectContaining({ path: 'atual' })]);
    expect(runner.health()[0]).toMatchObject({ source: 'simulado:open-meteo', lastError: 'schema' });
  });

  it('TC13: atraso de 10 s → timeout de 3 s (relógio falso, sem esperar de verdade) e timer limpo', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { clock, runner, logger } = setupRunner();
    const weather = new SimulatedWeatherAdapter({ fonte: fonteControlada({ weather: { tipo: 'atraso', ms: 10_000 } }), clock });

    let pronto = false;
    const promessa = runner.observe(weather, SP, { logger }).finally(() => (pronto = true));
    await vi.advanceTimersByTimeAsync(2_999);
    expect(pronto).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const obs = ObservationSchema.parse(await promessa);

    expect(obs.status).toBe('unavailable');
    expect(obs.motivo).toBe('A fonte não respondeu a tempo');
    expect(logger.lines.find((l) => l.msg === 'falha no provedor')?.obj.erro).toBe('timeout');
    expect(vi.getTimerCount()).toBe(0); // o atraso simulado foi cancelado pelo signal
  });

  it('atraso menor que o timeout → responde fresh', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { clock, runner, logger } = setupRunner();
    const weather = new SimulatedWeatherAdapter({ fonte: fonteControlada({ weather: { tipo: 'atraso', ms: 1_000 } }), clock });

    const promessa = runner.observe(weather, SP, { logger });
    await vi.advanceTimersByTimeAsync(1_000);

    expect((await promessa).status).toBe('fresh');
  });

  it('prazo global abortado → unavailable por prazo do briefing, sem contar falha no breaker', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { clock, runner, logger } = setupRunner();
    const weather = new SimulatedWeatherAdapter({ fonte: fonteControlada({ weather: { tipo: 'atraso', ms: 10_000 } }), clock });
    const prazo = new AbortController();

    const promessa = runner.observe(weather, SP, { logger, signal: prazo.signal });
    await vi.advanceTimersByTimeAsync(500);
    prazo.abort();
    const obs = await promessa;

    expect(obs.status).toBe('unavailable');
    expect(obs.motivo).toBe('Prazo do briefing esgotado antes da resposta da fonte');
    expect(runner.breakerFor(weather.source).state).toBe('closed');
  });

  it('a chave do cenário entra no cacheKey: trocar de cenário não reaproveita o cache', async () => {
    const { clock, runner, logger } = setupRunner();
    const fonte = fonteControlada({ weather: { tipo: 'valor', chuvaMmH: [0] } });
    const weather = new SimulatedWeatherAdapter({ fonte, clock });

    await runner.observe(weather, SP, { logger });
    await runner.observe(weather, SP, { logger });
    expect(weather.chamadas).toBe(1); // mesmo cenário: cache hit dentro do TTL

    fonte.estado.simulacao = { weather: { tipo: 'valor', chuvaMmH: [12] } };
    fonte.estado.chave = 'teste#1';
    const obs = await runner.observe(weather, SP, { logger });

    expect(weather.chamadas).toBe(2);
    expect(obs.value?.horas[0]?.precipitacaoMm).toBe(12);
  });

  it('cenário `real` (simulacao null) → os simulados devolvem o valor normal', async () => {
    const { clock, runner, logger } = setupRunner();
    const weather = new SimulatedWeatherAdapter({ fonte: fonteControlada(null), clock });

    const obs = await runner.observe(weather, SP, { logger });

    expect(obs.status).toBe('fresh');
    expect(obs.value?.horas.every((h) => h.precipitacaoMm === 0)).toBe(true);
  });
});
