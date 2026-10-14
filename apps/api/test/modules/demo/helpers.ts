// Apoio aos testes do modo demonstração (T21): briefing "de bolso" = simulados → ProviderRunner → regras.
// Reproduz só o que o T27 fará com os provedores (fan-out + regras), sem rota de briefing.
import { vi } from 'vitest';
import { ObservationSchema, type Observation } from '@kairos/contracts';
import { LruCache } from '../../../src/infrastructure/cache/lru-cache.js';
import { ProviderRunner } from '../../../src/infrastructure/provider-runner.js';
import { CenarioAtivo, TRAJETO_REFERENCIA } from '../../../src/modules/demo/index.js';
import {
  calcularConfianca,
  calcularJanelaMeteorologica,
  calcularVeredito,
} from '../../../src/modules/rules/index.js';
import { criarProvedoresSimulados, type ProvedoresSimulados } from '../../../src/providers/simulated/index.js';
import { FakeClock, memoryLogger } from '../../infrastructure/helpers.js';

export const AGORA_MS = Date.parse('2026-10-10T18:08:00-03:00');

export function montarDemo() {
  const clock = new FakeClock(AGORA_MS);
  const runner = new ProviderRunner({ cache: new LruCache({ clock }), clock });
  const cenario = new CenarioAtivo(clock);
  const provedores = criarProvedoresSimulados(cenario, clock);
  const logger = memoryLogger();
  return { clock, runner, cenario, provedores, logger };
}

/**
 * Pede as 6 dimensões em paralelo, como o fan-out do T27, com o trajeto como entrada de todos os
 * simulados. Exige vi.useFakeTimers: avança só 3 s de relógio falso (o timeout do provedor, C.5),
 * então um cenário que dependesse de esperar os 10 s reais nunca terminaria aqui.
 */
export async function briefingSimulado(
  demo: { clock: FakeClock; runner: ProviderRunner; provedores: ProvedoresSimulados; logger: ReturnType<typeof memoryLogger> },
  trajeto = TRAJETO_REFERENCIA,
) {
  const { runner, provedores: p, logger, clock } = demo;
  const opts = { logger };
  const promessa = Promise.all([
    runner.observe(p.weather, trajeto, opts),
    runner.observe(p.air, trajeto, opts),
    runner.observe(p.bus, trajeto, opts),
    runner.observe(p.rail, trajeto, opts),
    runner.observe(p.flood, trajeto, opts),
    runner.observe(p.traffic, trajeto, opts),
  ]);
  await vi.advanceTimersByTimeAsync(3_000);
  const observacoes: Observation[] = (await promessa).map((o) => ObservationSchema.parse(o));
  const agora = new Date(clock.now());
  return {
    observacoes,
    ...calcularVeredito(observacoes, trajeto, agora),
    confianca: calcularConfianca(observacoes, trajeto),
    janela: calcularJanelaMeteorologica(observacoes, agora),
  };
}
