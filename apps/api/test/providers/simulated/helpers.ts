// Apoio aos testes dos provedores simulados (T21): fonte de cenário controlada pelo teste
import type { CenarioSimulado, FonteDeCenario } from '../../../src/providers/simulated/index.js';
import { LruCache } from '../../../src/infrastructure/cache/lru-cache.js';
import { ProviderRunner } from '../../../src/infrastructure/provider-runner.js';
import { FakeClock, memoryLogger } from '../../infrastructure/helpers.js';

/** Fonte mutável: o teste troca `simulacao`/`chave` como a rota de demo faria. */
export function fonteControlada(simulacao: CenarioSimulado | null = {}): FonteDeCenario & {
  estado: { simulacao: CenarioSimulado | null; chave: string };
} {
  const estado = { simulacao, chave: 'teste#0' };
  return { estado, chave: () => estado.chave, simulacao: () => estado.simulacao };
}

export function setupRunner() {
  const clock = new FakeClock();
  const runner = new ProviderRunner({ cache: new LruCache({ clock }), clock });
  const logger = memoryLogger();
  return { clock, runner, logger };
}
