// T19 / RF09: verificação do adaptador ARTESP contra a API Trilhos REAL.
// Uso (a partir de apps/api): node --import tsx scripts/verificar-artesp.ts
// Faz UMA requisição (de 12/h da credencial) pelo mesmo caminho do briefing (ProviderRunner → adaptador)
// e imprime as linhas, a situação, o detalhe e os cabeçalhos de limite. Carrega o .env da raiz e nunca
// imprime a chave (toda saída passa por `semChave`).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ObservationSchema } from '@kairos/contracts';
import { LruCache } from '../src/infrastructure/cache/lru-cache.js';
import { createHttpClient, type FetchFn } from '../src/infrastructure/http-client.js';
import { configurarRede } from '../src/infrastructure/network.js';
import { ProviderRunner, type ProviderLogger } from '../src/infrastructure/provider-runner.js';
import { AQUECIMENTO_TIMEOUT_MS } from '../src/infrastructure/warm-up.js';
import { ARTESP_SOURCE, createArtespAdapter } from '../src/providers/rail/artesp.adapter.js';

const ENV = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(ENV)) process.loadEnvFile(ENV);
const chave = process.env.ARTESP_KEY?.trim();
if (!chave) {
  console.error('ARTESP_KEY ausente no .env da raiz. Abortando.');
  process.exit(1);
}
const semChave = (s: string) => s.split(chave).join('***');
const imprimir = (s: string) => console.info(semChave(s));

const CABECALHOS = ['x-ratelimit-limit', 'x-ratelimit-remaining', 'retry-after', 'x-data-license', 'date'];
const vistos: Record<string, string> = {};
let http = 0;
const fetchQueGuarda: FetchFn = async (input, init) => {
  const res = await fetch(input, init);
  http = res.status;
  for (const h of CABECALHOS) if (res.headers.has(h)) vistos[h] = res.headers.get(h)!;
  return res;
};

const logger: ProviderLogger = {
  info: (obj, msg) => imprimir(`${msg ?? ''} ${JSON.stringify(obj)}`),
  warn: (obj, msg) => imprimir(`${msg ?? ''} ${JSON.stringify(obj)}`),
};

const inicio = new Date();
imprimir(`Início: ${inicio.toISOString()} (SP: ${inicio.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })})`);

configurarRede(); // como o index.ts
const provider = createArtespAdapter({ chave, http: createHttpClient({ fetch: fetchQueGuarda }) });
const runner = new ProviderRunner({ cache: new LruCache(), rateLimiters: { [ARTESP_SOURCE]: provider.limiter } });
// Mesmo caminho do servidor: o aquecimento (prazo de 15 s) faz a chamada — a 1ª conexão levou 6,9 s no
// spike e estourou os 3 s em 13/10 15:31 — e o briefing lê do cache.
const t0 = performance.now();
try {
  await runner.refresh(provider, [], { timeoutMs: AQUECIMENTO_TIMEOUT_MS });
} catch (err) {
  imprimir(`aquecimento falhou: ${err instanceof Error ? err.message : String(err)}`);
}
imprimir(`chamada real: ${Math.round(performance.now() - t0)} ms`);
const obs = await runner.observe(provider, [], { logger });

imprimir(`HTTP ${http}; cabeçalhos: ${JSON.stringify(vistos)}`);
imprimir(`Envelope: source=${obs.source} status=${obs.status} observedAt=${obs.observedAt} fetchedAt=${obs.fetchedAt}` +
  (obs.motivo ? ` motivo="${obs.motivo}"` : ''));
for (const l of obs.value?.linhas ?? []) {
  imprimir(`  ${l.linha.padEnd(3)} ${l.statusTexto} → ${l.situacao}${l.detalhe ? ` | ${l.detalhe}` : ''}`);
}
imprimir(`Observação no contrato: ${ObservationSchema.safeParse(obs).success}`);
process.exitCode = obs.status === 'unavailable' ? 1 : 0;
