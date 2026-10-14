// Composição da API (T27/T28): cria UMA vez por app o runner, o cache, os limitadores, os adaptadores,
// o estado da demo e os simulados, e registra os plugins de rota. Tudo que fala com o mundo externo
// (http, banco, relógio, adaptadores) é injetável em `deps` para os testes rodarem sem rede.
import type { GeocodeResponse } from '@kairos/contracts';
import fastify, { type FastifyServerOptions } from 'fastify';
import { LruCache } from './infrastructure/cache/lru-cache.js';
import { ValkeyCache, conectarValkey, type ValkeyClient } from './infrastructure/cache/valkey-cache.js';
import { systemClock, type Clock } from './infrastructure/clock.js';
import { createHttpClient, type HttpClient } from './infrastructure/http-client.js';
import { ProviderRunner } from './infrastructure/provider-runner.js';
import type { Provider } from './infrastructure/provider.js';
import { LimiteCota, MinIntervalLimiter, RATE_LIMITS } from './infrastructure/rate-limiter.js';
import { aquecerConexoes } from './infrastructure/warm-up.js';
import { briefingRoutes } from './modules/briefing/briefing.routes.js';
import { BriefingService, type ProvedoresReais } from './modules/briefing/briefing.service.js';
import { CenarioAtivo, demoRoutes } from './modules/demo/index.js';
import { FloodRiskService, criarPool, type Coordenada, type Queryable } from './modules/flood-risk/index.js';
import { geocodeRoutes } from './modules/geocode/geocode.routes.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { GradeClimaAdapter } from './modules/mapa/grade-clima.adapter.js';
import { mapaRoutes } from './modules/mapa/mapa.routes.js';
import { PontosAlagamentoAdapter } from './modules/mapa/pontos-alagamento.adapter.js';
import { transitoRoutes } from './modules/mapa/transito.routes.js';
import { rotaRoutes } from './modules/rota/rota.routes.js';
import { RouteGeometryService } from './modules/routing/route-geometry.service.js';
import { reportsRoutes } from './modules/reports/reports.routes.js';
import { ReportsService } from './modules/reports/reports.service.js';
import { railLinesRoutes } from './modules/transit/rail-lines.routes.js';
import { transitRoutes } from './modules/transit/transit.routes.js';
import { weatherRoutes } from './modules/weather/weather.routes.js';
import { OpenMeteoAirQualityAdapter } from './providers/air-quality/open-meteo-air-quality.adapter.js';
import { GeoSampaFloodAdapter } from './providers/flood/geosampa-flood.adapter.js';
import { NOMINATIM_SOURCE, NominatimAdapter } from './providers/geocode/nominatim.adapter.js';
import { ARTESP_SOURCE, createArtespAdapter } from './providers/rail/artesp.adapter.js';
import { createMetroSpAdapter } from './providers/rail/metro-sp.adapter.js';
import { OSRM_SOURCE, OsrmAdapter, type RotaInput, type RotaOsrm } from './providers/routing/osrm.adapter.js';
import { TOMTOM_SOURCE, createTomTomRotas, type TomTomRotas } from './providers/routing/tomtom.adapter.js';
import { criarProvedoresSimulados } from './providers/simulated/index.js';
import { TomTomFlowTiles } from './providers/traffic/tomtom-flow-tiles.adapter.js';
import { OlhoVivoAdapter } from './providers/transit/olhovivo.adapter.js';
import { OlhoVivoClient } from './providers/transit/olhovivo.client.js';
import { OpenMeteoAdapter } from './providers/weather/open-meteo.adapter.js';

/** Configuração lida do ambiente pelo index.ts (nunca lida aqui dentro). */
export interface ConfigApp {
  /** Vazio/ausente: a API sobe e ônibus fica `unavailable` com motivo de configuração. */
  sptransToken?: string;
  /** Vazio/ausente: sem provedor ARTESP; trilhos só pela página do Metrô (1–5 e 15). */
  artespKey?: string;
  /**
   * Vazio/ausente: sem TomTom — geometria pelo OSRM, `traffic` unavailable, /v1/rota só de carro (OSRM) e
   * camada de trânsito do mapa 503.
   */
  tomtomKey?: string;
  osrmBaseUrl?: string;
  nominatimBaseUrl?: string;
  demoMode?: boolean;
  demoToken?: string;
  /**
   * Trabalho em segundo plano (defeito de 13/10/2026): aquecimento das conexões no boot e renovação
   * antecipada do cache (clima, ar, Metrô, alagamento). Padrão false (testes); o index.ts liga.
   */
  segundoPlano?: boolean;
  /**
   * Valkey compartilhado com o worker (RF27, perfil sd-avancado). Vazio/ausente = LRU em memória. Com ele,
   * quem renova o cache é o worker: a renovação antecipada da API fica desligada (o aquecimento continua).
   */
  cacheUrl?: string;
  cachePassword?: string;
  /** HMAC do hash de trajeto no histórico (RF26, RNF14). Ausente = segredo aleatório por processo. */
  historicoSegredo?: string;
}

/** Centro de SP (Praça da Sé): ponto do aquecimento de clima e ar no boot. */
export const PONTO_AQUECIMENTO = { lat: -23.5505, lon: -46.6333 } as const;
/** Sé → MASP em [lon, lat]: consulta de alagamento do aquecimento (abre o pool e esquenta o PostGIS). */
const LINHA_AQUECIMENTO: Coordenada[] = [
  [-46.6333, -23.5505],
  [-46.6561, -23.5614],
];

export interface DependenciasApp {
  clock?: Clock;
  /** Cliente HTTP compartilhado pelos adaptadores reais (testes: fetch falso). */
  http?: HttpClient;
  /** Banco do FloodRiskService; padrão: pool do `criarPool()` (encerrado no close do app). */
  db?: Queryable;
  /** Substitui adaptadores reais de dimensão (testes). */
  reais?: Partial<ProvedoresReais>;
  osrm?: Provider<RotaInput, RotaOsrm>;
  nominatim?: Provider<string, GeocodeResponse>;
  /** Substitui as rotas TomTom (testes); null = como sem chave. */
  tomtom?: Pick<TomTomRotas, 'carro' | 'aPe'> | null;
  /** Substitui o proxy de tiles (testes); null = como sem chave. */
  tomtomTiles?: Pick<TomTomFlowTiles, 'obter'> | null;
  prazoBriefingMs?: number;
  /** Cliente Valkey (testes: dublê em memória); padrão: conecta em `config.cacheUrl`, se houver. */
  valkey?: ValkeyClient;
}

export interface BuildAppOptions {
  server?: FastifyServerOptions;
  config?: ConfigApp;
  deps?: DependenciasApp;
}

export function buildApp({ server = {}, config = {}, deps = {} }: BuildAppOptions = {}) {
  const app = fastify(server);
  const clock = deps.clock ?? systemClock;
  const http = deps.http ?? createHttpClient();
  const artespKey = config.artespKey?.trim() || undefined;
  // Sem chave o provedor nem existe; o limitador dele (≤ 10/h + Retry-After) vai para o runner
  const artesp = artespKey ? createArtespAdapter({ chave: artespKey, http, clock }) : null;
  const tomtomKey = config.tomtomKey?.trim() || undefined;
  const tomtomReal = tomtomKey ? createTomTomRotas({ chave: tomtomKey, http, clock }) : null;
  const tomtom = deps.tomtom === undefined ? tomtomReal : deps.tomtom;
  const tomtomTiles =
    deps.tomtomTiles === undefined ? (tomtomKey ? new TomTomFlowTiles({ chave: tomtomKey, http, clock }) : null) : deps.tomtomTiles;

  const valkeyClient =
    deps.valkey ?? (config.cacheUrl ? conectarValkey(config.cacheUrl, { password: config.cachePassword, logger: app.log }) : undefined);
  const valkey = valkeyClient ? new ValkeyCache({ client: valkeyClient, logger: app.log, escritor: 'api', clock }) : null;
  if (valkey) app.addHook('onClose', () => valkey.close());

  // UM runner por app: cache, breakers, limitadores e estatísticas de saúde compartilhados
  const runner = new ProviderRunner({
    cache: valkey ?? new LruCache({ clock }),
    ...(valkey ? { coordenacao: valkey } : {}),
    clock,
    rateLimiters: {
      [OSRM_SOURCE]: new MinIntervalLimiter({ intervalMs: RATE_LIMITS.umPorSegundoMs, clock }),
      [NOMINATIM_SOURCE]: new MinIntervalLimiter({ intervalMs: RATE_LIMITS.umPorSegundoMs, clock }),
      ...(artesp ? { [ARTESP_SOURCE]: artesp.limiter } : {}),
      // Cota da TomTom (rotas de carro e a pé juntas): ≤ 600/24 h e 4/s; ver RATE_LIMITS.tomtomRotas
      [TOMTOM_SOURCE]: tomtomReal?.limiter ?? new LimiteCota({ ...RATE_LIMITS.tomtomRotas, clock }),
    },
    // Com Valkey, só o worker renova: uma varredura em vez de duas sobre as mesmas chaves (RF27)
    ...(config.segundoPlano && !valkey ? { refreshAhead: { logger: app.log } } : {}),
  });

  let db = deps.db;
  if (!db) {
    const pool = criarPool();
    app.addHook('onClose', () => pool.end());
    db = pool;
  }

  const sptransToken = config.sptransToken?.trim() || undefined;
  const olhoVivo = new OlhoVivoClient({ token: sptransToken, http });
  const reais: ProvedoresReais = {
    weather: new OpenMeteoAdapter(http, clock),
    air: new OpenMeteoAirQualityAdapter(http, clock),
    bus: sptransToken ? new OlhoVivoAdapter(olhoVivo, clock) : null,
    rail: createMetroSpAdapter({ http }),
    artesp,
    flood: new GeoSampaFloodAdapter(new FloodRiskService(db)),
    ...deps.reais,
  };
  const osrm = deps.osrm ?? new OsrmAdapter({ http, baseUrl: config.osrmBaseUrl || undefined });
  const nominatim = deps.nominatim ?? new NominatimAdapter({ http, baseUrl: config.nominatimBaseUrl || undefined });

  const demoMode = config.demoMode ?? false;
  const cenario = new CenarioAtivo(clock);
  const reports = config.historicoSegredo
    ? new ReportsService(db, clock, config.historicoSegredo)
    : new ReportsService(db, clock);
  const briefing = new BriefingService({
    runner,
    clock,
    geometria: new RouteGeometryService(runner, osrm, tomtom?.carro ?? null),
    reais,
    demo: { demoMode, cenario, simulados: criarProvedoresSimulados(cenario, clock) },
    prazoMs: deps.prazoBriefingMs,
    historico: reports,
  });

  app.register(healthRoutes, { runner });
  app.register(briefingRoutes, { briefing });
  app.register(reportsRoutes, { reports });
  app.register(weatherRoutes, { runner, weather: reais.weather });
  app.register(transitRoutes, { runner, olhoVivo });
  app.register(railLinesRoutes, { artespConfigurada: !!reais.artesp });
  app.register(geocodeRoutes, { runner, nominatim });
  app.register(demoRoutes, { demoMode, demoToken: config.demoToken || undefined, cenario });
  app.register(mapaRoutes, {
    runner,
    alagamento: new PontosAlagamentoAdapter(db),
    clima: new GradeClimaAdapter(http, clock),
  });
  app.register(rotaRoutes, { runner, tomtom, osrm });
  app.register(transitoRoutes, { tiles: tomtomTiles });

  if (config.segundoPlano) {
    const aquecimento = new AbortController();
    app.addHook('onReady', async () => {
      runner.startBackground();
      // Sem await: o boot não espera nem cai por causa das fontes
      void aquecerConexoes(
        runner,
        [
          { provider: reais.weather, input: PONTO_AQUECIMENTO },
          { provider: reais.air, input: PONTO_AQUECIMENTO },
          { provider: reais.rail, input: [] },
          // ARTESP: 1 chamada por boot (conta no teto de 12/h da credencial; o limitador já a registra).
          // Fica fora da renovação antecipada (refreshAhead ausente no adaptador): ver artesp.adapter.ts.
          ...(reais.artesp ? [{ provider: reais.artesp, input: [] }] : []),
          // Banco: a 1ª consulta com linha levou 5,6 s no container (13/10/2026) e as seguintes ~30 ms
          { provider: reais.flood, input: LINHA_AQUECIMENTO },
        ],
        { logger: app.log, signal: aquecimento.signal },
      );
    });
    app.addHook('onClose', async () => {
      aquecimento.abort();
      runner.stopBackground();
    });
  }

  return app;
}
