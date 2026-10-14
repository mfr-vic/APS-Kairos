// Verificação contra a TomTom real (RF22/RF24): 1 rota de carro com trânsito, MASP → Praça da Sé.
// Imprime distância, tempos, atraso, nível e trechos lentos. NUNCA imprime a URL nem a chave (vai na query string).
// Uso (em apps/api): node --env-file-if-exists=../../.env --import tsx scripts/verificar-tomtom.ts
import { LruCache } from '../src/infrastructure/cache/lru-cache.js';
import { configurarRede } from '../src/infrastructure/network.js';
import { ProviderRunner, type ProviderLogger } from '../src/infrastructure/provider-runner.js';
import { valorTransito } from '../src/modules/routing/route-geometry.service.js';
import { TOMTOM_SOURCE, createTomTomRotas, mascararChave } from '../src/providers/routing/tomtom.adapter.js';

const MASP = { lat: -23.5614961, lon: -46.6559677 };
const SE = { lat: -23.5503898, lon: -46.633081 };

configurarRede(); // como o index.ts (1 s por endereço na escolha IPv6/IPv4)
const chave = process.env.TOMTOM_KEY?.trim();
if (!chave) {
  console.error('TOMTOM_KEY ausente no ambiente (.env da raiz).');
  process.exit(1);
}
const agora = () => new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
// Defesa extra: qualquer coisa que o runner logar passa pela máscara
const logger: ProviderLogger = {
  info: (obj, msg) => console.info(mascararChave(`[${agora()}] ${msg ?? ''} ${JSON.stringify(obj)}`, chave)),
  warn: (obj, msg) => console.info(mascararChave(`[${agora()}] AVISO ${msg ?? ''} ${JSON.stringify(obj)}`, chave)),
};

const rotas = createTomTomRotas({ chave });
const runner = new ProviderRunner({ cache: new LruCache(), rateLimiters: { [TOMTOM_SOURCE]: rotas.limiter } });

console.info(`Início: ${agora()} (America/Sao_Paulo). Chave: ${chave.length} caracteres (não exibida).`);
console.info(`Rota de carro com trânsito: MASP (${MASP.lat}, ${MASP.lon}) → Praça da Sé (${SE.lat}, ${SE.lon})`);
const o = await runner.execute(rotas.carro, { origem: MASP, destino: SE }, { logger });
if (o.status === 'unavailable') {
  console.info(`indisponível: ${o.motivo}`);
  process.exit(1);
}
const t = valorTransito(o.value);
console.info(`latência ${o.latencyMs} ms; ${o.value.coordenadas.length} pontos`);
console.info(`distância ${t.distanciaM} m; sem trânsito ${t.duracaoLivreS} s; com trânsito ${t.duracaoAtualS} s; atraso ${t.atrasoS} s; nível ${t.nivel}`);
console.info(`trechos lentos: ${t.trechosLentos.length}`);
for (const tr of t.trechosLentos) console.info(`  - atraso ${tr.atrasoS} s, ${tr.comprimentoM} m, magnitude ${tr.magnitude}`);
console.info(`Fim: ${agora()}. Chamadas externas: TomTom 1.`);
