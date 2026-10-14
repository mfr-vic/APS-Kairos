// Worker do perfil sd-avancado (RF27, T35, ADR-01/ADR-06): processo separado que mantém quente o cache
// compartilhado no Valkey. É a renovação antecipada (infrastructure/refresh-ahead.ts) fora da API:
//  1. no boot, pré-aquece entradas fixas e baratas (clima/ar no centro, Metrô, camadas do mapa);
//  2. a cada varredura, lê do Valkey as chaves que os usuários pediram (a API as registra) e renova as que
//     passaram de 80 % do TTL, com o MESMO runner e os MESMOS adaptadores da API;
//  3. um lock curto por chave (SET NX PX) impede que a API, este worker ou outro worker busquem a mesma
//     chave ao mesmo tempo.
// Só fontes com `refreshAhead` (clima, ar, página do Metrô, alagamento local). Nunca ARTESP (teto de
// 12/h por credencial), OSRM, Nominatim, Olho Vivo nem TomTom (a cota diária é contada por processo).
import { pathToFileURL } from 'node:url';
import { PONTO_AQUECIMENTO } from './app.js';
import { ValkeyCache, type ChaveQuente, conectarValkey, type CacheLogger } from './infrastructure/cache/valkey-cache.js';
import { systemClock, type Clock } from './infrastructure/clock.js';
import { createHttpClient } from './infrastructure/http-client.js';
import { configurarRede } from './infrastructure/network.js';
import { LOCK_RENOVACAO_MS, ProviderRunner } from './infrastructure/provider-runner.js';
import type { Provider } from './infrastructure/provider.js';
import { REFRESH_AHEAD_PADRAO, RefreshAhead } from './infrastructure/refresh-ahead.js';
import { aquecerConexoes, type AlvoAquecimento } from './infrastructure/warm-up.js';
import { FloodRiskService, criarPool } from './modules/flood-risk/index.js';
import { GradeClimaAdapter } from './modules/mapa/grade-clima.adapter.js';
import { PontosAlagamentoAdapter } from './modules/mapa/pontos-alagamento.adapter.js';
import { OpenMeteoAirQualityAdapter } from './providers/air-quality/open-meteo-air-quality.adapter.js';
import { GeoSampaFloodAdapter } from './providers/flood/geosampa-flood.adapter.js';
import { createMetroSpAdapter } from './providers/rail/metro-sp.adapter.js';
import { OpenMeteoAdapter } from './providers/weather/open-meteo.adapter.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QualquerProvider = Provider<any, unknown>;

export interface WorkerOptions {
  cache: Pick<ValkeyCache, 'listarQuentes' | 'getStale' | 'tentarLock'>;
  runner: Pick<ProviderRunner, 'refresh'>;
  /** Adaptadores que o worker sabe renovar; os sem `refreshAhead` são ignorados. */
  provedores: readonly QualquerProvider[];
  logger: CacheLogger;
  clock?: Clock;
  /** Período da varredura. Padrão 30 s (igual ao refresh-ahead da API). */
  intervalMs?: number;
}

/** Chave do runner para o provedor e a entrada; undefined se a entrada não serve a este provedor. */
function chaveDe(provider: QualquerProvider, input: unknown): string | undefined {
  try {
    return `${provider.source}:${provider.cacheKey(input)}`;
  } catch {
    return undefined;
  }
}

export function criarWorker(o: WorkerOptions) {
  const intervalMs = o.intervalMs ?? REFRESH_AHEAD_PADRAO.intervalMs;
  const renovaveis = o.provedores.filter((p) => p.refreshAhead);
  const renovacao = new RefreshAhead({
    logger: o.logger,
    clock: o.clock,
    intervalMs,
    // O Valkey já esquece as chaves sem pedido há 6 h; aqui basta sobreviver entre duas varreduras
    idleMs: 2 * intervalMs,
    storedAt: async (key) => (await o.cache.getStale(key))?.storedAt,
    lock: (key, ms) => o.cache.tentarLock(key, ms),
  });
  let timer: ReturnType<typeof setInterval> | undefined;

  /** Acha o adaptador que produz exatamente esta chave (a mesma fonte pode ter dois, ex.: open-meteo). */
  function providerDa(q: ChaveQuente): QualquerProvider | undefined {
    return renovaveis.find((p) => p.source === q.source && chaveDe(p, q.input) === q.key);
  }

  /** Uma varredura: sincroniza as chaves quentes do Valkey e renova as que estão perto de vencer. */
  async function tick(): Promise<void> {
    const quentes = await o.cache.listarQuentes();
    let ignoradas = 0;
    for (const q of quentes) {
      const provider = providerDa(q);
      if (!provider) {
        ignoradas++;
        continue;
      }
      renovacao.track({
        key: q.key,
        source: provider.source,
        ttlSeconds: provider.ttlSeconds,
        run: ({ signal, timeoutMs }) => o.runner.refresh(provider, q.input, { signal, timeoutMs }),
      });
    }
    await renovacao.tick();
    o.logger.info({ quentes: quentes.length, ignoradas }, 'worker: varredura');
  }

  /** Pré-aquecimento do boot (RF27): só as entradas cujo lock este processo conseguiu. */
  async function preAquecer(alvos: readonly AlvoAquecimento[], signal?: AbortSignal): Promise<void> {
    const livres: AlvoAquecimento[] = [];
    for (const alvo of alvos) {
      const key = chaveDe(alvo.provider, alvo.input);
      if (key && alvo.provider.refreshAhead && (await o.cache.tentarLock(key, LOCK_RENOVACAO_MS))) livres.push(alvo);
    }
    await aquecerConexoes(o.runner, livres, { logger: o.logger, signal });
  }

  return {
    tick,
    preAquecer,
    start(): void {
      // Varreduras sobrepostas não duplicam chamadas: o RefreshAhead reaproveita a renovação em voo da chave
      const loop = () => void tick().catch((err: Error) => o.logger.warn({ mensagem: err.message }, 'worker: varredura falhou'));
      timer ??= setInterval(loop, intervalMs);
    },
    stop(): void {
      clearInterval(timer);
      timer = undefined;
      renovacao.stop();
    },
  };
}

/** Log em JSON por linha (o pino fica na API; aqui bastam info/warn estruturados). */
function loggerJson(): CacheLogger {
  const escrever = (level: string) => (obj: object, msg?: string) =>
    // eslint-disable-next-line no-console -- o stdout é o log do container
    console.log(JSON.stringify({ level, time: new Date().toISOString(), proc: 'worker', msg, ...obj }));
  return { info: escrever('info'), warn: escrever('warn') };
}

async function main(): Promise<void> {
  configurarRede();
  const env = process.env;
  const logger = loggerJson();
  if (!env.CACHE_URL) {
    logger.warn({}, 'CACHE_URL ausente: o worker só faz sentido com o Valkey (perfil sd-avancado)');
    process.exit(1);
  }
  const clock = systemClock;
  const http = createHttpClient();
  const cache = new ValkeyCache({
    client: conectarValkey(env.CACHE_URL, { password: env.CACHE_PASSWORD, logger }),
    logger,
    escritor: 'worker',
    clock,
  });
  const runner = new ProviderRunner({ cache, clock });
  const pool = criarPool(env, { application_name: 'kairos-worker', max: 2 });
  // Os mesmos adaptadores do app.ts (só os renováveis)
  const weather = new OpenMeteoAdapter(http, clock);
  const air = new OpenMeteoAirQualityAdapter(http, clock);
  const rail = createMetroSpAdapter({ http });
  const gradeClima = new GradeClimaAdapter(http, clock);
  const pontosAlagamento = new PontosAlagamentoAdapter(pool);
  const flood = new GeoSampaFloodAdapter(new FloodRiskService(pool));

  const worker = criarWorker({ cache, runner, provedores: [weather, air, rail, flood, gradeClima, pontosAlagamento], logger, clock });
  const parar = new AbortController();
  // Espera a 1ª conexão (até 5 s): sem isso o pré-aquecimento gravaria só no LRU local (visto em 14/10)
  for (let i = 0; i < 10; i++) {
    await cache.listarQuentes();
    if (!cache.emFallback) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  void worker.preAquecer(
    [
      { provider: weather, input: PONTO_AQUECIMENTO },
      { provider: air, input: PONTO_AQUECIMENTO },
      { provider: rail, input: [] },
      { provider: gradeClima, input: undefined },
      { provider: pontosAlagamento, input: undefined },
    ],
    parar.signal,
  );
  worker.start();
  logger.info({}, 'worker iniciado');

  const encerrar = async () => {
    parar.abort();
    worker.stop();
    await cache.close();
    await pool.end().catch(() => undefined);
    process.exit(0);
  };
  process.once('SIGTERM', () => void encerrar());
  process.once('SIGINT', () => void encerrar());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
