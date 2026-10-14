// T18: verificação do adaptador Olho Vivo contra a API real (RF02, RF08).
// Uso (a partir de apps/api): node --import tsx scripts/verificar-olho-vivo.ts
// Carrega o .env da raiz; nunca imprime o token nem o cookie de sessão.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ObservationSchema } from '@kairos/contracts';
import { LruCache } from '../src/infrastructure/cache/lru-cache.js';
import { ProviderRunner, type ProviderLogger } from '../src/infrastructure/provider-runner.js';
import { OlhoVivoAdapter } from '../src/providers/transit/olhovivo.adapter.js';
import { OlhoVivoBuscaLinhasAdapter, OlhoVivoBuscaParadasAdapter } from '../src/providers/transit/olhovivo-busca.adapter.js';
import { OlhoVivoClient } from '../src/providers/transit/olhovivo.client.js';

const ENV = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(ENV)) process.loadEnvFile(ENV);
const token = process.env.SPTRANS_TOKEN;
if (!token) {
  console.error('SPTRANS_TOKEN ausente no .env da raiz. Abortando.');
  process.exit(1);
}

const agora = () => new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }) + ' (America/Sao_Paulo)';
const semToken = (s: string) => s.split(token).join('***');
const logs: string[] = [];
const logger: ProviderLogger = {
  info: (obj, msg) => logs.push(semToken(`${msg ?? ''} ${JSON.stringify(obj)}`)),
  warn: (obj, msg) => logs.push(semToken(`WARN ${msg ?? ''} ${JSON.stringify(obj)}`)),
};
const mostrar = (titulo: string, valor: unknown) => console.info(`\n## ${titulo}\n${semToken(JSON.stringify(valor, null, 2))}`);

console.info(`Início: ${agora()}`);
const client = new OlhoVivoClient({ token });
const runner = new ProviderRunner({ cache: new LruCache() });

const linhas = await runner.execute(new OlhoVivoBuscaLinhasAdapter(client), '875A', { logger });
mostrar('Linhas "875A" (GET /v1/transit/bus/lines?q=875A)', { status: linhas.status, latencyMs: linhas.latencyMs, value: linhas.value, motivo: linhas.motivo });

const paradas = await runner.execute(new OlhoVivoBuscaParadasAdapter(client), 609, { logger });
mostrar('Paradas da linha 609 (GET /v1/transit/bus/stops?lineCode=609)', {
  status: paradas.status,
  latencyMs: paradas.latencyMs,
  total: paradas.value?.paradas.length ?? null,
  value: paradas.value,
  motivo: paradas.motivo,
});

const obs = await runner.observe(
  new OlhoVivoAdapter(client),
  { codigoParada: 260016861, linhas: [{ codigoLinha: 609, letreiro: '875A-10', codigoParada: 260016861 }] },
  { logger },
);
const valida = ObservationSchema.safeParse(obs);
mostrar('Observação bus da parada 260016861, linha 609', obs);
console.info(`Observation válida no contrato: ${valida.success}`);

console.info('\n## Logs do ProviderRunner');
for (const l of logs) console.info(l);
console.info(`\nFim: ${agora()}`);
