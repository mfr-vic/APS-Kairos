// T17: verificação manual dos adaptadores Open-Meteo (clima e ar) contra a API REAL.
// Não é teste automatizado: faz 1 chamada a cada fonte, pelo ProviderRunner, e imprime as Observations.
//
// Uso (a partir de apps/api):
//   node --import tsx scripts/verificar-open-meteo.ts [lat] [lon]     # padrão: Praça da Sé
import { ObservationSchema } from '@kairos/contracts';
import { LruCache } from '../src/infrastructure/cache/lru-cache.js';
import { KAIROS_USER_AGENT } from '../src/infrastructure/http-client.js';
import { ProviderRunner, type ProviderLogger } from '../src/infrastructure/provider-runner.js';
import { OpenMeteoAirQualityAdapter } from '../src/providers/air-quality/open-meteo-air-quality.adapter.js';
import { OpenMeteoAdapter } from '../src/providers/weather/open-meteo.adapter.js';

const [latArg, lonArg] = process.argv.slice(2);
const ponto = { lat: latArg ? Number(latArg) : -23.5505, lon: lonArg ? Number(lonArg) : -46.6333 };

const logger: ProviderLogger = {
  info: (obj, msg) => console.info(`[log] ${msg ?? ''} ${JSON.stringify(obj)}`),
  warn: (obj, msg) => console.warn(`[log] ${msg ?? ''} ${JSON.stringify(obj)}`),
};

const agoraSP = () => new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const runner = new ProviderRunner({ cache: new LruCache() });

console.info(`Início: ${agoraSP()} (America/Sao_Paulo) | ponto ${ponto.lat}, ${ponto.lon}`);
console.info(`User-Agent: ${KAIROS_USER_AGENT}`);

let falhou = false;
for (const adapter of [new OpenMeteoAdapter(), new OpenMeteoAirQualityAdapter()]) {
  const obs = await runner.observe(adapter, ponto, { logger });
  const valida = ObservationSchema.safeParse(obs);
  console.info(`\n=== ${obs.dimension} (${obs.source}) — ObservationSchema: ${valida.success ? 'válida' : 'INVÁLIDA'}`);
  console.info(JSON.stringify(obs, null, 2));
  if (!valida.success || obs.status === 'unavailable') falhou = true;
}
console.info(`\nFim: ${agoraSP()} (America/Sao_Paulo)`);
process.exitCode = falhou ? 1 : 0;
