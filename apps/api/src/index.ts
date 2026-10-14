import { buildApp } from './app.js';
import { configurarRede } from './infrastructure/network.js';

configurarRede();
const env = process.env;
const app = buildApp({
  server: {
    logger: {
      level: env.LOG_LEVEL || 'info',
      // O token da demo nunca vai para o log (C.7)
      redact: ['req.headers["x-demo-token"]'],
      transport: {
        target: 'pino-pretty',
      },
    },
  },
  config: {
    sptransToken: env.SPTRANS_TOKEN,
    // Sem ARTESP_KEY: trilhos só pela página do Metrô (1–5 e 15); 6–9 ficam fora (RF03)
    artespKey: env.ARTESP_KEY || undefined,
    // Sem TOMTOM_KEY: geometria pelo OSRM, trânsito indisponível, rota a pé 503 (RF22/RF24)
    tomtomKey: env.TOMTOM_KEY || undefined,
    osrmBaseUrl: env.OSRM_BASE_URL || undefined,
    nominatimBaseUrl: env.NOMINATIM_BASE_URL || undefined,
    demoMode: env.DEMO_MODE === 'true',
    demoToken: env.DEMO_TOKEN || undefined,
    // Aquecimento no boot + renovação antecipada do cache (refresh-ahead.ts)
    segundoPlano: true,
    // Perfil sd-avancado (RF27): cache compartilhado com o worker. Sem CACHE_URL = LRU em memória
    cacheUrl: env.CACHE_URL || undefined,
    cachePassword: env.CACHE_PASSWORD || undefined,
    // RF26/RNF14: segredo do HMAC do histórico. Sem ele, aleatório por boot (hash ainda irreversível)
    historicoSegredo: env.HISTORICO_SEGREDO || undefined,
  },
  // Banco: criarPool() lê DB_HOST, DB_PORT, DB_USER, DB_PASSWORD e DB_NAME
});

const start = async () => {
  try {
    const port = parseInt(env.API_PORT || '3000', 10);
    const host = env.API_HOST || '0.0.0.0';
    await app.listen({ host, port });
    if (!env.SPTRANS_TOKEN?.trim()) app.log.warn('SPTRANS_TOKEN ausente: ônibus ficará indisponível no briefing');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
