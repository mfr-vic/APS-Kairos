// ValkeyCache (RF27, T35): CachePort no Valkey com fallback ao LRU local, chaves quentes e lock.
import { describe, expect, it } from 'vitest';
import { CONTRACT_VERSION, type WeatherValue } from '@kairos/contracts';
import { ValkeyCache } from '../../../src/infrastructure/cache/valkey-cache.js';
import { ProviderRunner } from '../../../src/infrastructure/provider-runner.js';
import type { DimensionProvider } from '../../../src/infrastructure/provider.js';
import { FakeClock, memoryLogger } from '../helpers.js';
import { FakeValkey } from './fake-valkey.js';

const flush = () => new Promise((r) => setImmediate(r));

function setup(escritor = 'api') {
  const clock = new FakeClock();
  const client = new FakeValkey(clock);
  const logger = memoryLogger();
  const cache = new ValkeyCache({ client, logger, escritor, clock });
  return { clock, client, logger, cache };
}

describe('ValkeyCache (RF27)', () => {
  it('get dentro do TTL; vencido some do get mas fica no getStale até 3×TTL', async () => {
    const { clock, cache } = setup();
    await cache.set('open-meteo:x', { a: 1 }, 60);
    expect((await cache.get('open-meteo:x'))?.value).toEqual({ a: 1 });

    clock.advance(61_000);
    expect(await cache.get('open-meteo:x')).toBeUndefined();
    const stale = await cache.getStale<{ a: number }>('open-meteo:x');
    expect(stale?.value).toEqual({ a: 1 });
    expect(stale?.ageSeconds).toBe(61);

    clock.advance(120_000); // 181 s > 3×60
    expect(await cache.getStale('open-meteo:x')).toBeUndefined();
  });

  it('compartilha entre processos e prefixa a chave com a versão do contrato', async () => {
    const { clock, client, cache: api } = setup('api');
    const worker = new ValkeyCache({ client, logger: memoryLogger(), escritor: 'worker', clock });
    await worker.set('metro-sp:direto-metro', 'ok', 300);
    expect([...client.strings.keys()]).toEqual([`kairos:${CONTRACT_VERSION}:metro-sp:direto-metro`]);
    expect((await api.get('metro-sp:direto-metro'))?.value).toBe('ok');
  });

  it('loga hit com quem gravou e miss, só com a fonte (sem coordenadas)', async () => {
    const { client, clock, logger, cache } = setup('api');
    const worker = new ValkeyCache({ client, logger: memoryLogger(), escritor: 'worker', clock });
    await worker.set('open-meteo:-23.550,-46.633', 1, 60);
    clock.advance(5_000);
    await cache.get('open-meteo:-23.550,-46.633');
    await cache.get('open-meteo:outra');
    expect(logger.lines.map((l) => l.obj)).toEqual([
      { fonte: 'open-meteo', cache: 'hit', escritor: 'worker', idadeS: 5 },
      { fonte: 'open-meteo', cache: 'miss' },
    ]);
  });

  it('Valkey fora: cai no LRU local (gravado junto), loga uma vez e volta quando o Valkey volta', async () => {
    const { client, logger, cache } = setup();
    await cache.set('k:1', 'v1', 60);
    client.fora = true;
    expect((await cache.get('k:1'))?.value).toBe('v1');
    await cache.set('k:2', 'v2', 60); // não lança
    expect((await cache.getStale('k:2'))?.value).toBe('v2');
    expect(cache.emFallback).toBe(true);
    expect(logger.lines.filter((l) => l.msg === 'valkey indisponível: usando o LRU local')).toHaveLength(1);

    client.fora = false;
    expect((await cache.get('k:1'))?.value).toBe('v1');
    expect(cache.emFallback).toBe(false);
    expect(logger.lines.some((l) => l.msg === 'valkey de volta: cache compartilhado reativado')).toBe(true);
  });

  it('lock: só o primeiro consegue até expirar; sem Valkey é sempre concedido', async () => {
    const { clock, client, cache } = setup('api');
    const worker = new ValkeyCache({ client, logger: memoryLogger(), escritor: 'worker', clock });
    expect(await worker.tentarLock('metro-sp:direto-metro', 20_000)).toBe(true);
    expect(await cache.tentarLock('metro-sp:direto-metro', 20_000)).toBe(false);
    clock.advance(20_001);
    expect(await cache.tentarLock('metro-sp:direto-metro', 20_000)).toBe(true);
    client.fora = true;
    expect(await cache.tentarLock('outra', 20_000)).toBe(true);
  });

  it('chaves quentes: dedup por chave, esquece as sem pedido há 6 h e limita a quantidade', async () => {
    const { clock, client, cache } = setup();
    const pequeno = new ValkeyCache({ client, logger: memoryLogger(), escritor: 'api', clock, maxQuentes: 2 });
    cache.registrarQuente({ key: 'a:1', source: 'a', ttlSeconds: 60, input: { lat: 1 } });
    await flush();
    clock.advance(6 * 60 * 60_000 + 1);
    cache.registrarQuente({ key: 'b:1', source: 'b', ttlSeconds: 60, input: null });
    cache.registrarQuente({ key: 'b:1', source: 'b', ttlSeconds: 60, input: null });
    cache.registrarQuente({ key: 'c:1', source: 'c', ttlSeconds: 60, input: undefined });
    await flush();
    expect((await cache.listarQuentes()).map((q) => q.key)).toEqual(['b:1', 'c:1']);

    clock.advance(1);
    cache.registrarQuente({ key: 'd:1', source: 'd', ttlSeconds: 60, input: [1, 2] });
    await flush();
    expect(await pequeno.listarQuentes()).toEqual([
      { key: 'c:1', source: 'c', ttlSeconds: 60, input: null },
      { key: 'd:1', source: 'd', ttlSeconds: 60, input: [1, 2] },
    ]);
  });
});

describe('ProviderRunner com o ValkeyCache como coordenação (RF27)', () => {
  const CLIMA: WeatherValue = {
    atual: { temperaturaC: 21, precipitacaoMm: 0, ventoKmH: 8, codigoTempo: 3, sensacaoC: 20, umidadePct: 70, uv: 5 },
    hoje: null,
    sol: null,
    horas: [],
  };

  function provider(refreshAhead: boolean) {
    const p = {
      source: 'open-meteo',
      dimension: 'weather' as const,
      ttlSeconds: 900,
      refreshAhead,
      chamadas: 0,
      cacheKey: (i: { lat: number }) => String(i.lat),
      async fetch() {
        p.chamadas++;
        return { value: CLIMA };
      },
    };
    return p satisfies DimensionProvider<{ lat: number }, 'weather'>;
  }

  it('miss: toma o lock da chave, grava no Valkey e registra a chave quente (só opt-in)', async () => {
    const { clock, client, cache } = setup('api');
    const runner = new ProviderRunner({ cache, clock, coordenacao: cache });
    const logger = memoryLogger();
    await runner.observe(provider(true), { lat: -23 }, { logger });
    await runner.observe(provider(false), { lat: -24 }, { logger });
    await flush();

    expect(client.comandos.filter((c) => c === 'set-nx')).toHaveLength(1);
    expect(await cache.tentarLock('open-meteo:-23', 1000)).toBe(false); // lock da API ainda vale
    expect(await cache.listarQuentes()).toEqual([{ key: 'open-meteo:-23', source: 'open-meteo', ttlSeconds: 900, input: { lat: -23 } }]);
  });

  it('a requisição não espera o lock: com o worker buscando, a API ainda vai à fonte', async () => {
    const { clock, client, cache } = setup('api');
    const worker = new ValkeyCache({ client, logger: memoryLogger(), escritor: 'worker', clock });
    await worker.tentarLock('open-meteo:-23', 20_000);
    const p = provider(true);
    const obs = await new ProviderRunner({ cache, clock, coordenacao: cache }).observe(p, { lat: -23 }, { logger: memoryLogger() });
    expect(obs.status).toBe('fresh');
    expect(p.chamadas).toBe(1);
  });
});
