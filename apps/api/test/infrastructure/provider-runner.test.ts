import { afterEach, describe, expect, it, vi } from 'vitest';
import { ObservationSchema, type RailValue, type WeatherValue } from '@kairos/contracts';
import { LruCache } from '../../src/infrastructure/cache/lru-cache.js';
import { SchemaValidationError } from '../../src/infrastructure/errors.js';
import type { DimensionProvider, ProviderResult } from '../../src/infrastructure/provider.js';
import { ProviderRunner, classifyAge } from '../../src/infrastructure/provider-runner.js';
import { SlidingWindowLimiter } from '../../src/infrastructure/rate-limiter.js';
import { FakeClock, memoryLogger } from './helpers.js';

const CLIMA: WeatherValue = {
  atual: { temperaturaC: 21.4, precipitacaoMm: 0, ventoKmH: 8, codigoTempo: 3, sensacaoC: 20.4, umidadePct: 70, uv: 5 },
  hoje: null,
  sol: null,
  horas: [],
};

type Comportamento = () => Promise<ProviderResult<WeatherValue>>;

/** Provedor de clima simulado: conta chamadas e executa o comportamento atual. */
function fakeWeather(comportamento: Comportamento, timeoutMs?: number) {
  const provider = {
    source: 'open-meteo',
    dimension: 'weather' as const,
    ttlSeconds: 15 * 60,
    timeoutMs,
    calls: 0,
    comportamento,
    cacheKey: (input: { lat: number; lon: number }) => `${input.lat.toFixed(3)},${input.lon.toFixed(3)}`,
    async fetch() {
      provider.calls++;
      return provider.comportamento();
    },
  };
  return provider satisfies DimensionProvider<{ lat: number; lon: number }, 'weather'>;
}

const SP = { lat: -23.5505, lon: -46.6333 };
const ok: Comportamento = async () => ({ value: CLIMA });
const falha: Comportamento = async () => {
  throw new Error('ECONNRESET');
};

function setup() {
  const clock = new FakeClock();
  const cache = new LruCache({ clock });
  const runner = new ProviderRunner({ cache, clock });
  const logger = memoryLogger();
  return { clock, cache, runner, logger };
}

describe('classifyAge (B.8)', () => {
  it('fresh ≤ TTL, stale ≤ 3×TTL, unavailable acima', () => {
    expect(classifyAge(60, 60)).toBe('fresh');
    expect(classifyAge(61, 60)).toBe('stale');
    expect(classifyAge(180, 60)).toBe('stale');
    expect(classifyAge(181, 60)).toBe('unavailable');
  });
});

describe('ProviderRunner (T16)', () => {
  it('TC16: 2 pedidos iguais em 10 s → 1 chamada externa; log miss e depois hit', async () => {
    const { clock, runner, logger } = setup();
    const provider = fakeWeather(ok);

    const primeira = await runner.observe(provider, SP, { logger });
    clock.advance(10_000);
    const segunda = await runner.observe(provider, SP, { logger });

    expect(provider.calls).toBe(1);
    expect(ObservationSchema.parse(primeira).status).toBe('fresh');
    expect(ObservationSchema.parse(segunda).status).toBe('fresh');
    expect(primeira).toMatchObject({ dimension: 'weather', source: 'open-meteo', ttlSeconds: 900, value: CLIMA });
    const logs = logger.lines.filter((l) => l.msg === 'provider').map((l) => l.obj);
    expect(logs.map((l) => l.cache)).toEqual(['miss', 'hit']);
    expect(logs[0]).toMatchObject({ provider: 'open-meteo', dimension: 'weather', status: 'fresh' });
    expect(typeof logs[0]!.latencyMs).toBe('number');
  });

  it('fonte falhando com cache vencido ≤ 3×TTL → stale com motivo; acima disso → unavailable', async () => {
    const { clock, runner, logger } = setup();
    const provider = fakeWeather(ok);
    await runner.observe(provider, SP, { logger });

    provider.comportamento = falha;
    clock.advance(20 * 60_000); // 20 min > TTL de 15 min
    const stale = ObservationSchema.parse(await runner.observe(provider, SP, { logger }));
    expect(stale.status).toBe('stale');
    expect(stale.value).toEqual(CLIMA);
    expect(stale.motivo).toContain('20 min');
    expect(logger.lines.at(-1)!.obj).toMatchObject({ cache: 'stale', status: 'stale', erro: 'network' });

    clock.advance(26 * 60_000); // 46 min > 45 min (3×TTL)
    const indisponivel = ObservationSchema.parse(await runner.observe(provider, SP, { logger }));
    expect(indisponivel.status).toBe('unavailable');
    expect(indisponivel.value).toBeNull();
    expect(indisponivel.motivo).toBe('Falha de conexão com a fonte');
  });

  it('TC15: observedAt antigo vindo da fonte → stale mesmo em busca bem-sucedida', async () => {
    const { clock, runner, logger } = setup();
    const antigo = new Date(clock.now() - 30 * 60_000).toISOString();
    const provider = fakeWeather(async () => ({ value: CLIMA, observedAt: antigo }));
    const obs = ObservationSchema.parse(await runner.observe(provider, SP, { logger }));
    expect(obs.status).toBe('stale');
    expect(obs.observedAt).toBe(antigo);
  });

  it('TC14: valor fora do schema do contrato → unavailable e log com o trecho inválido', async () => {
    const { runner, logger } = setup();
    const provider = fakeWeather(async () => ({ value: { atual: { temperaturaC: 'quente' } } as unknown as WeatherValue }));
    const obs = ObservationSchema.parse(await runner.observe(provider, SP, { logger }));
    expect(obs.status).toBe('unavailable');
    expect(obs.motivo).toBe('A fonte respondeu em formato inesperado');
    const warn = logger.lines.find((l) => l.level === 'warn')!;
    expect(warn.obj).toMatchObject({ provider: 'open-meteo', erro: 'schema', trecho: '"quente"' });
  });

  it('erro de schema lançado pelo adaptador (http-client) também vira unavailable', async () => {
    const { runner, logger } = setup();
    const provider = fakeWeather(async () => {
      throw new SchemaValidationError([{ path: 'current', message: 'Required' }], 'undefined');
    });
    const obs = await runner.observe(provider, SP, { logger });
    expect(ObservationSchema.safeParse(obs).success).toBe(true);
    expect(obs.status).toBe('unavailable');
  });

  it('timeout do provedor vale mesmo se o adaptador ignorar o signal', async () => {
    const { runner, logger } = setup();
    const provider = fakeWeather(() => new Promise(() => undefined), 20);
    const obs = ObservationSchema.parse(await runner.observe(provider, SP, { logger }));
    expect(obs.status).toBe('unavailable');
    expect(obs.motivo).toBe('A fonte não respondeu a tempo');
  });

  it('prazo global (signal externo) → unavailable sem contar falha no breaker', async () => {
    const { runner, logger } = setup();
    const provider = fakeWeather(() => new Promise(() => undefined), 5_000);
    const controller = new AbortController();
    const promise = runner.observe(provider, SP, { logger, signal: controller.signal });
    setTimeout(() => controller.abort(), 10);
    const obs = ObservationSchema.parse(await promise);
    expect(obs.status).toBe('unavailable');
    expect(logger.lines.at(-1)!.obj).toMatchObject({ erro: 'aborted' });
    expect(runner.breakerFor('open-meteo').state).toBe('closed');
  });

  it('TC18: provedor sempre falhando, 5 pedidos seguidos → só 3 chamadas à fonte', async () => {
    const { runner, logger } = setup();
    const provider = fakeWeather(falha);
    const resultados = [];
    for (let i = 0; i < 5; i++) resultados.push(await runner.observe(provider, SP, { logger }));
    expect(provider.calls).toBe(3);
    expect(resultados.every((o) => ObservationSchema.safeParse(o).success && o.status === 'unavailable')).toBe(true);
    expect(resultados[4]!.motivo).toBe('Fonte com falhas repetidas; nova tentativa em instantes');
    expect(runner.health()).toEqual([
      expect.objectContaining({ source: 'open-meteo', breaker: 'open', lastError: 'circuit-open' }),
    ]);
  });

  it('RF18: contadores por fonte só de chamadas reais (sucesso, falha, cache hit, breaker aberto)', async () => {
    const { clock, runner, logger } = setup();
    const provider = fakeWeather(async () => {
      clock.advance(100);
      return { value: CLIMA };
    });

    await runner.observe(provider, SP, { logger }); // miss: 1 chamada, 100 ms
    await runner.observe(provider, SP, { logger }); // hit: não conta
    expect(runner.health()[0]).toMatchObject({ requestCount: 1, successCount: 1, avgLatencyMs: 100 });

    provider.comportamento = async () => {
      clock.advance(300);
      return { value: CLIMA };
    };
    await runner.observe(provider, { lat: -23.6, lon: -46.7 }, { logger }); // miss: 300 ms → média 200
    expect(runner.health()[0]).toMatchObject({ requestCount: 2, successCount: 2, avgLatencyMs: 200 });

    provider.comportamento = falha;
    for (const lon of [-46.8, -46.9, -47.0]) await runner.observe(provider, { lat: -23.6, lon }, { logger }); // 3 falhas
    await runner.observe(provider, { lat: -23.6, lon: -47.1 }, { logger }); // breaker aberto: fonte não é chamada
    expect(provider.calls).toBe(5);
    expect(runner.health()[0]).toMatchObject({
      breaker: 'open',
      requestCount: 5,
      successCount: 2,
      avgLatencyMs: 200, // falhas não entram na média
    });
  });

  it('TC17: 50 briefings em 1 h simulada → ARTESP chamada ≤ 12 vezes', async () => {
    const clock = new FakeClock();
    const artespLimiter = new SlidingWindowLimiter({ maxRequests: 10, windowMs: 3_600_000, clock });
    const runner = new ProviderRunner({ cache: new LruCache({ clock }), clock, rateLimiters: { artesp: artespLimiter } });
    const logger = memoryLogger();
    const trilhos: RailValue = { linhas: [{ linha: 'L4', statusTexto: 'Operação Normal', situacao: 'NORMAL', detalhe: null, fonte: 'artesp' }] };
    let chamadas = 0;
    const artesp: DimensionProvider<string[], 'rail'> = {
      source: 'artesp',
      dimension: 'rail',
      ttlSeconds: 6 * 60,
      cacheKey: () => 'status',
      fetch: async () => {
        chamadas++;
        return { value: trilhos };
      },
    };

    for (let i = 0; i < 50; i++) {
      const obs = await runner.observe(artesp, ['L4'], { logger });
      expect(ObservationSchema.safeParse(obs).success).toBe(true);
      clock.advance(72_000); // 50 × 72 s = 1 h
    }
    expect(chamadas).toBeLessThanOrEqual(12);
    expect(logger.lines.filter((l) => l.obj.cache === 'miss').length).toBe(chamadas);
  });

  it('limite de taxa esgotado sem cache → unavailable com motivo', async () => {
    const { clock, cache, logger } = setup();
    const limiter = new SlidingWindowLimiter({ maxRequests: 1, windowMs: 3_600_000, clock });
    const runner = new ProviderRunner({ cache, clock, rateLimiters: { 'open-meteo': limiter } });
    const provider = fakeWeather(ok);
    await runner.observe(provider, SP, { logger });
    const outra = await runner.observe(provider, { lat: -23.6, lon: -46.7 }, { logger });
    expect(ObservationSchema.safeParse(outra).success).toBe(true);
    expect(outra.motivo).toBe('Limite de consultas à fonte atingido');
    expect(provider.calls).toBe(1);
    // Limite atingido não chega à fonte: não conta como requisição
    expect(runner.health()[0]).toMatchObject({ requestCount: 1, successCount: 1 });
  });

  it('fonte nunca chamada não aparece em health(); sem sucesso a média é null', async () => {
    const { runner, logger } = setup();
    expect(runner.health()).toEqual([]);
    await runner.observe(fakeWeather(falha), SP, { logger });
    expect(runner.health()).toEqual([
      expect.objectContaining({ source: 'open-meteo', requestCount: 1, successCount: 0, avgLatencyMs: null }),
    ]);
  });
});

describe('ProviderRunner + renovação antecipada (defeito de 13/10/2026)', () => {
  const TTL_MS = 15 * 60_000;

  function setupRA() {
    const clock = new FakeClock();
    const cache = new LruCache({ clock });
    const logger = memoryLogger();
    const runner = new ProviderRunner({ cache, clock, refreshAhead: { logger } });
    return { clock, cache, runner, logger };
  }

  /** Provedor que registra o prazo recebido do runner em cada chamada. */
  function optIn(comportamento: Comportamento, refreshAhead = true, source = 'open-meteo') {
    const base = fakeWeather(comportamento);
    const prazos: (number | undefined)[] = [];
    const provider = {
      ...base,
      source,
      refreshAhead,
      prazos,
      calls: 0,
      async fetch(_input: unknown, ctx: { signal: AbortSignal; timeoutMs?: number }) {
        provider.calls++;
        prazos.push(ctx.timeoutMs);
        return provider.comportamento();
      },
    };
    return provider;
  }

  it('renova a ~80 % do TTL só os provedores opt-in, com prazo de 15 s', async () => {
    const { clock, runner, logger } = setupRA();
    const clima = optIn(ok);
    const onibus = optIn(ok, false, 'sptrans-olhovivo');
    await runner.observe(clima, SP, { logger });
    await runner.observe(onibus, SP, { logger });

    clock.advance(0.8 * TTL_MS);
    await runner.refreshAhead!.tick();
    expect(clima.calls).toBe(2);
    expect(clima.prazos).toEqual([3_000, 15_000]); // pedido do usuário (padrão C.5) × fundo
    expect(onibus.calls).toBe(1);
    expect(runner.refreshAhead!.keys).toHaveLength(1);
    expect(runner.refreshAhead!.keys[0]).toMatch(/^open-meteo:/);
    expect(logger.lines.some((l) => l.msg === 'renovação antecipada')).toBe(true);

    // Pedido do usuário depois do TTL original: sai do cache renovado, fresh, sem chamar a fonte
    clock.advance(0.3 * TTL_MS);
    const obs = ObservationSchema.parse(await runner.observe(clima, SP, { logger }));
    expect(obs.status).toBe('fresh');
    expect(clima.calls).toBe(2);
  });

  it('desligada por padrão: sem `refreshAhead` nas opções, nada é lembrado', async () => {
    const { runner, logger } = setup();
    await runner.observe(optIn(ok), SP, { logger });
    expect(runner.refreshAhead).toBeNull();
  });

  it('respeita o circuit breaker aberto: não chama a fonte', async () => {
    const { clock, runner, logger } = setupRA();
    const clima = optIn(ok);
    await runner.observe(clima, SP, { logger });
    clock.advance(0.8 * TTL_MS);
    const breaker = runner.breakerFor('open-meteo');
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.state).toBe('open');

    await runner.refreshAhead!.tick();
    expect(clima.calls).toBe(1);
    expect(logger.lines.at(-1)).toMatchObject({ level: 'warn', obj: { erro: 'circuit-open' } });
  });

  it('falha da renovação não apaga o cache bom: fresh até o TTL, depois stale', async () => {
    const { clock, runner, logger } = setupRA();
    const clima = optIn(ok);
    await runner.observe(clima, SP, { logger });

    clima.comportamento = falha;
    clock.advance(0.8 * TTL_MS);
    await runner.refreshAhead!.tick();
    expect(clima.calls).toBe(2);

    const ainda = ObservationSchema.parse(await runner.observe(clima, SP, { logger }));
    expect(ainda).toMatchObject({ status: 'fresh', value: CLIMA });

    clock.advance(0.3 * TTL_MS); // passou do TTL; fonte segue falhando
    const vencido = ObservationSchema.parse(await runner.observe(clima, SP, { logger }));
    expect(vencido).toMatchObject({ status: 'stale', value: CLIMA });
  });

  describe('regressão: conexão fria (1ª chamada leva 5 s, as seguintes 200 ms)', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    /** A conexão só "esquenta" quando uma chamada termina; chamada abortada deixa tudo frio. */
    function fonteFria() {
      let quente = false;
      const p = {
        source: 'open-meteo',
        dimension: 'weather' as const,
        ttlSeconds: 15 * 60,
        timeoutMs: 3_000,
        refreshAhead: true,
        calls: 0,
        cacheKey: () => 'sp',
        fetch(_input: unknown, ctx: { signal: AbortSignal }) {
          p.calls++;
          return new Promise<ProviderResult<WeatherValue>>((resolve, reject) => {
            const t = setTimeout(() => {
              quente = true;
              resolve({ value: CLIMA });
            }, quente ? 200 : 5_000);
            ctx.signal.addEventListener('abort', () => {
              clearTimeout(t);
              reject(new DOMException('aborted', 'AbortError'));
            }, { once: true });
          });
        },
      };
      return p;
    }

    async function cenario(comRenovacao: boolean) {
      vi.useFakeTimers({ now: Date.parse('2026-10-13T04:40:00Z') });
      const clock = { now: () => Date.now() };
      const logger = memoryLogger();
      const runner = new ProviderRunner({
        cache: new LruCache({ clock }),
        clock,
        ...(comRenovacao ? { refreshAhead: { logger } } : {}),
      });
      const fonte = fonteFria();
      const pedir = async () => {
        const inicio = Date.now();
        const p = runner.observe(fonte, SP, { logger });
        await vi.advanceTimersByTimeAsync(4_000); // prazo do briefing (C.5)
        return { obs: ObservationSchema.parse(await p), ms: Date.now() - inicio };
      };

      // 1º pedido: conexão fria estoura os 3 s
      const primeiro = await pedir();
      // usuário volta ~10 s depois do 1º pedido
      await vi.advanceTimersByTimeAsync(6_000);
      const segundo = await pedir();
      return { primeiro, segundo, fonte, runner };
    }

    it('sem renovação (defeito): o pedido seguinte também abre conexão fria e fica unavailable', async () => {
      const { primeiro, segundo } = await cenario(false);
      expect(primeiro.obs).toMatchObject({ status: 'unavailable', motivo: 'A fonte não respondeu a tempo' });
      expect(segundo.obs.status).toBe('unavailable');
    });

    it('com renovação: o fundo (15 s) completa a conexão e o pedido seguinte sai fresh do cache', async () => {
      const { primeiro, segundo, fonte, runner } = await cenario(true);
      expect(primeiro.obs.status).toBe('unavailable');
      expect(segundo.obs).toMatchObject({ status: 'fresh', value: CLIMA });
      expect(segundo.ms).toBeLessThanOrEqual(4_000);
      expect(fonte.calls).toBe(2); // pedido 1 (abortado) + renovação; o pedido 2 não chamou a fonte

      // 16 min parado (> TTL de 15 min): a varredura de 30 s renova a ~80 % do TTL e o usuário
      // recebe fresh direto do cache, sem a requisição esperar pela fonte
      runner.startBackground();
      await vi.advanceTimersByTimeAsync(16 * 60_000);
      const chamadasAntes = fonte.calls;
      expect(chamadasAntes).toBe(3);
      const logger = memoryLogger();
      const obs = ObservationSchema.parse(await runner.observe(fonte, SP, { logger }));
      expect(obs.status).toBe('fresh');
      expect(fonte.calls).toBe(chamadasAntes);
      expect(logger.lines.at(-1)!.obj).toMatchObject({ cache: 'hit' });
      runner.stopBackground();
    });
  });
});
