// Worker do perfil sd-avancado (RF27, T35): renova pelo Valkey as chaves que a API registrou.
import { describe, expect, it } from 'vitest';
import { ValkeyCache } from '../src/infrastructure/cache/valkey-cache.js';
import { ProviderRunner } from '../src/infrastructure/provider-runner.js';
import type { Provider } from '../src/infrastructure/provider.js';
import { criarWorker } from '../src/worker.js';
import { FakeValkey } from './infrastructure/cache/fake-valkey.js';
import { FakeClock, memoryLogger } from './infrastructure/helpers.js';

const flush = () => new Promise((r) => setImmediate(r));

function fonte(source: string, refreshAhead: boolean, cacheKey: (i: { lat: number }) => string = (i) => String(i.lat)) {
  const p = {
    source,
    ttlSeconds: 100,
    refreshAhead,
    chamadas: [] as unknown[],
    cacheKey,
    async fetch(input: { lat: number }) {
      p.chamadas.push(input);
      return { value: `valor-${input.lat}` };
    },
  };
  return p satisfies Provider<{ lat: number }, string>;
}

function setup() {
  const clock = new FakeClock();
  const client = new FakeValkey(clock);
  const api = new ValkeyCache({ client, logger: memoryLogger(), escritor: 'api', clock });
  const cacheWorker = new ValkeyCache({ client, logger: memoryLogger(), escritor: 'worker', clock });
  const logger = memoryLogger();
  const clima = fonte('open-meteo', true);
  const artesp = fonte('artesp', false);
  const novoWorker = (provedores: Provider<{ lat: number }, string>[] = [clima, artesp]) =>
    criarWorker({ cache: cacheWorker, runner: new ProviderRunner({ cache: cacheWorker, clock }), provedores, logger, clock });
  return { clock, client, api, cacheWorker, logger, clima, artesp, worker: novoWorker(), novoWorker };
}

describe('worker (RF27)', () => {
  it('renova a chave quente a ≥ 80 % do TTL, com a mesma entrada, e a API passa a ler o dado do worker', async () => {
    const { clock, api, logger, clima, worker } = setup();
    await api.set('open-meteo:-23', { value: 'velho', observedAt: new Date(clock.now()).toISOString(), fetchedAt: '' }, 100);
    api.registrarQuente({ key: 'open-meteo:-23', source: 'open-meteo', ttlSeconds: 100, input: { lat: -23 } });
    await flush();

    clock.advance(79_000);
    await worker.tick();
    expect(clima.chamadas).toEqual([]);

    clock.advance(2_000); // 81 s
    await worker.tick();
    expect(clima.chamadas).toEqual([{ lat: -23 }]);
    expect(logger.lines.some((l) => l.msg === 'renovação antecipada' && l.obj.provider === 'open-meteo')).toBe(true);

    const hit = await api.get<{ value: string }>('open-meteo:-23');
    expect(hit?.value.value).toBe('valor--23');
    expect(hit?.ageSeconds).toBe(0);
  });

  it('nunca chama fonte sem refreshAhead (ARTESP) nem chave que não reconhece', async () => {
    const { api, artesp, clima, logger, worker } = setup();
    api.registrarQuente({ key: 'artesp:todas', source: 'artesp', ttlSeconds: 360, input: { lat: 0 } });
    api.registrarQuente({ key: 'open-meteo:outra-forma', source: 'open-meteo', ttlSeconds: 100, input: { lat: 1 } });
    await flush();
    await worker.tick();
    expect(artesp.chamadas).toEqual([]);
    expect(clima.chamadas).toEqual([]);
    expect(logger.lines.at(-1)?.obj).toEqual({ quentes: 2, ignoradas: 2 });
  });

  it('dois workers (ou API + worker): o lock deixa só um chamar a fonte', async () => {
    const { api, clima, novoWorker, logger } = setup();
    api.registrarQuente({ key: 'open-meteo:-23', source: 'open-meteo', ttlSeconds: 100, input: { lat: -23 } });
    await flush();
    const a = novoWorker();
    const b = novoWorker();
    await Promise.all([a.tick(), b.tick()]);
    expect(clima.chamadas).toHaveLength(1);
    expect(logger.lines.some((l) => l.msg === 'renovação antecipada: outro processo já renova')).toBe(true);
  });

  it('pré-aquecimento do boot: só fontes renováveis e só as chaves cujo lock conseguiu', async () => {
    const { api, clima, artesp, worker, cacheWorker } = setup();
    await api.tentarLock('open-meteo:2', 20_000); // a API já está buscando esta
    await worker.preAquecer([
      { provider: clima, input: { lat: 1 } },
      { provider: clima, input: { lat: 2 } },
      { provider: artesp, input: { lat: 3 } },
    ]);
    expect(clima.chamadas).toEqual([{ lat: 1 }]);
    expect(artesp.chamadas).toEqual([]);
    expect(await cacheWorker.get('open-meteo:1')).toBeDefined();
  });

  it('Valkey fora: a varredura não lança e não chama nada', async () => {
    const { client, clima, worker } = setup();
    client.fora = true;
    await expect(worker.tick()).resolves.toBeUndefined();
    expect(clima.chamadas).toEqual([]);
  });
});
