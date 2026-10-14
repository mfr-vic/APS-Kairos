import { describe, expect, it } from 'vitest';
import type { WeatherValue } from '@kairos/contracts';
import { LruCache } from '../../src/infrastructure/cache/lru-cache.js';
import { ProviderRunner } from '../../src/infrastructure/provider-runner.js';
import type { DimensionProvider, ProviderFetchContext } from '../../src/infrastructure/provider.js';
import { aquecerConexoes } from '../../src/infrastructure/warm-up.js';
import { FakeClock, memoryLogger } from './helpers.js';

const CLIMA: WeatherValue = {
  atual: { temperaturaC: 21.4, precipitacaoMm: 0, ventoKmH: 8, codigoTempo: 3, sensacaoC: 20.4, umidadePct: 70, uv: 5 },
  hoje: null,
  sol: null,
  horas: [],
};

function provedor(source: string, fetch: (ctx: ProviderFetchContext) => Promise<{ value: WeatherValue }>) {
  const p = {
    source,
    dimension: 'weather' as const,
    ttlSeconds: 900,
    timeoutMs: 3_000,
    calls: 0,
    prazos: [] as (number | undefined)[],
    cacheKey: () => 'sp',
    async fetch(_input: unknown, ctx: ProviderFetchContext) {
      p.calls++;
      p.prazos.push(ctx.timeoutMs);
      return fetch(ctx);
    },
  };
  return p satisfies DimensionProvider<unknown, 'weather'>;
}

const pendurado = (ctx: ProviderFetchContext) =>
  new Promise<never>((_, reject) => ctx.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));

describe('aquecerConexoes (boot)', () => {
  it('uma consulta por fonte com prazo próprio; falha e travamento viram log, sem lançar; cache fica preenchido', async () => {
    const clock = new FakeClock();
    const runner = new ProviderRunner({ cache: new LruCache({ clock }), clock });
    const logger = memoryLogger();
    const bom = provedor('open-meteo', async () => ({ value: CLIMA }));
    const ruim = provedor('open-meteo-air-quality', async () => {
      throw new Error('ECONNRESET');
    });
    const travado = provedor('metro-sp', pendurado);

    await expect(
      aquecerConexoes(runner, [{ provider: bom, input: null }, { provider: ruim, input: null }, { provider: travado, input: null }], {
        logger,
        timeoutMs: 50,
      }),
    ).resolves.toBeUndefined();

    expect([bom.calls, ruim.calls, travado.calls]).toEqual([1, 1, 1]);
    expect(bom.prazos).toEqual([50]);
    const porFonte = Object.fromEntries(logger.lines.map((l) => [l.obj.provider, l]));
    expect(porFonte['open-meteo']).toMatchObject({ level: 'info', msg: 'aquecimento' });
    expect(porFonte['open-meteo-air-quality']).toMatchObject({ level: 'warn', obj: { erro: 'network' } });
    expect(porFonte['metro-sp']).toMatchObject({ level: 'warn', obj: { erro: 'timeout' } });

    // O pedido seguinte do usuário sai do cache aquecido, sem chamar a fonte
    const obs = await runner.observe(bom, null, { logger });
    expect(obs.status).toBe('fresh');
    expect(bom.calls).toBe(1);
  });

  it('valor fora do contrato no aquecimento não entra no cache', async () => {
    const clock = new FakeClock();
    const runner = new ProviderRunner({ cache: new LruCache({ clock }), clock });
    const logger = memoryLogger();
    const invalido = provedor('open-meteo', async () => ({ value: { atual: null } as unknown as WeatherValue }));
    await aquecerConexoes(runner, [{ provider: invalido, input: null }], { logger });
    expect(logger.lines[0]).toMatchObject({ level: 'warn', obj: { erro: 'schema' } });
    invalido.calls = 0;
    await runner.observe(invalido, null, { logger });
    expect(invalido.calls).toBe(1); // não havia cache
  });
});
