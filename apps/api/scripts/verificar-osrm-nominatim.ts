// Verificação contra as APIs reais (T20, RF01, RF24, TC02, TC29a). Faz no máximo 2 chamadas:
// 1 busca no Nominatim e 1 rota no OSRM, com ≥ 1,1 s entre elas e o User-Agent do projeto.
// Uso (em apps/api): npx tsx scripts/verificar-osrm-nominatim.ts
import { LruCache } from '../src/infrastructure/cache/lru-cache.js';
import { KAIROS_USER_AGENT } from '../src/infrastructure/http-client.js';
import { ProviderRunner, type ProviderLogger } from '../src/infrastructure/provider-runner.js';
import { MinIntervalLimiter, RATE_LIMITS } from '../src/infrastructure/rate-limiter.js';
import { RouteGeometryService } from '../src/modules/routing/route-geometry.service.js';
import { NOMINATIM_SOURCE, NominatimAdapter } from '../src/providers/geocode/nominatim.adapter.js';
import { OSRM_SOURCE, OsrmAdapter } from '../src/providers/routing/osrm.adapter.js';

const CONSULTA = 'Avenida Paulista, 1578, São Paulo';
// Praça da Sé, do spike T08 (evita uma 2ª busca no Nominatim)
const SE = { lat: -23.5503898, lon: -46.633081 };
// MASP, do spike T08: só usado se a busca falhar
const MASP_SPIKE = { lat: -23.5614961, lon: -46.6559677 };

const agora = () => new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const logger: ProviderLogger = {
  info: (obj, msg) => console.info(`[${agora()}] ${msg ?? ''} ${JSON.stringify(obj)}`),
  warn: (obj, msg) => console.info(`[${agora()}] AVISO ${msg ?? ''} ${JSON.stringify(obj)}`),
};

// Um único limitador para as duas fontes: ≥ 1,1 s entre quaisquer duas chamadas deste script
const limitador = new MinIntervalLimiter({ intervalMs: RATE_LIMITS.umPorSegundoMs });
const runner = new ProviderRunner({
  cache: new LruCache(),
  rateLimiters: { [NOMINATIM_SOURCE]: limitador, [OSRM_SOURCE]: limitador },
});
const nominatim = new NominatimAdapter();
const geometria = new RouteGeometryService(runner, new OsrmAdapter());

console.info(`Início: ${agora()} (America/Sao_Paulo)`);
console.info(`User-Agent: ${KAIROS_USER_AGENT}`);

console.info(`\n1) Nominatim: "${CONSULTA}" → ${nominatim.url(CONSULTA)}`);
const busca = await runner.execute(nominatim, CONSULTA, { logger });
let origem = MASP_SPIKE;
if (busca.status === 'unavailable') {
  console.info(`   indisponível: ${busca.motivo}; a rota usa o MASP do spike`);
} else {
  console.info(`   ${busca.value.resultados.length} resultado(s) em ${busca.latencyMs} ms:`);
  for (const r of busca.value.resultados) console.info(`   - (${r.lat}, ${r.lon}) ${r.rotulo}`);
  const primeiro = busca.value.resultados[0];
  if (primeiro) origem = { lat: primeiro.lat, lon: primeiro.lon };
}

console.info(`\n2) OSRM: (${origem.lat}, ${origem.lon}) → Praça da Sé (${SE.lat}, ${SE.lon})`);
const inicio = Date.now();
const rota = await geometria.calcular(origem, SE, { logger });
const pontos = rota.coordenadas ?? [];
console.info(`   fonte=${rota.fonte}, ${pontos.length} pontos, ${Date.now() - inicio} ms (inclui a espera da fila)`);
console.info(`   primeiro=${JSON.stringify(pontos[0])} último=${JSON.stringify(pontos[pontos.length - 1])}`);
console.info(`\nFim: ${agora()}. Chamadas externas: Nominatim 1, OSRM 1.`);
