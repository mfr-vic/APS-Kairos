// T34 / RF21: verificação do adaptador contra a página REAL do "Direto do Metrô".
//
// Uso (a partir de apps/api):
//   node --import tsx scripts/verificar-metro-sp.ts
//
// Faz UMA requisição pelo mesmo caminho do briefing (ProviderRunner → adaptador → parser) e imprime
// a observação `rail` das linhas 1, 2, 3, 4, 5 e 15, mais o que o parser leu da página.
import { LruCache } from '../src/infrastructure/cache/lru-cache.js';
import { ProviderRunner, type ProviderLogger } from '../src/infrastructure/provider-runner.js';
import { createHttpClient, type FetchFn } from '../src/infrastructure/http-client.js';
import { LINHAS_METRO_SP, createMetroSpAdapter, observarLinhasMetroSp } from '../src/providers/rail/metro-sp.adapter.js';
import { parseDiretoMetro } from '../src/providers/rail/metro-sp.parser.js';

const corpo: { html?: string } = {};
// Guarda o corpo para mostrar os detalhes do parser sem uma segunda requisição
const fetchQueGuarda: FetchFn = async (input, init) => {
  const res = await fetch(input, init);
  corpo.html = await res.clone().text();
  return res;
};

const logger: ProviderLogger = {
  info: (obj, msg) => console.info(msg ?? '', JSON.stringify(obj)),
  warn: (obj, msg) => console.warn(msg ?? '', JSON.stringify(obj)),
};

const inicio = new Date();
console.info(`Início: ${inicio.toISOString()} (SP: ${inicio.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })})`);

const runner = new ProviderRunner({ cache: new LruCache() });
const provider = createMetroSpAdapter({ http: createHttpClient({ fetch: fetchQueGuarda }) });
const obs = await observarLinhasMetroSp(runner, provider, [...LINHAS_METRO_SP], { logger });

console.info('Observação:');
console.info(JSON.stringify(obs, null, 2));
if (corpo.html !== undefined && obs.status !== 'unavailable') {
  console.info('Linhas lidas pelo parser (inclui operadora, descrição e "atualizado em" por linha):');
  for (const l of parseDiretoMetro(corpo.html)) {
    console.info(`  ${l.linha.padEnd(4)} ${l.nome.padEnd(9)} ${String(l.operadora).padEnd(14)} ${l.statusTexto} → ${l.situacao} (${l.atualizadoEm})`);
  }
}
process.exitCode = obs.status === 'unavailable' ? 1 : 0;
