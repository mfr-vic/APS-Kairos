// Spike T05 — ARTESP API Trilhos (https://ccm.artesp.sp.gov.br/metroferroviario/api/docs/).
// Gasta 2 das 12 requisições/hora da credencial: /concessionarias/ e /status/ (sem filtros).
// Lê ARTESP_KEY do .env da raiz e NUNCA a imprime nem a grava; salva corpo + cabeçalhos relevantes.
// Uso (na raiz): node spikes/artesp/spike.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(aqui, '../../.env'), 'utf8');
const chave = /^ARTESP_KEY=(.*)$/m.exec(env)?.[1]?.trim();
if (!chave) throw new Error('ARTESP_KEY vazia no .env');

const BASE = 'https://ccm.artesp.sp.gov.br/metroferroviario/api';
const CABECALHOS_GUARDADOS = [
  'content-type',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'retry-after',
  'x-data-license',
  'link',
  'x-api-terms-version',
  'x-api-terms-accept-by',
  'date',
];

for (const [nome, rota] of [
  ['concessionarias', '/concessionarias/'],
  ['status', '/status/'],
]) {
  const inicio = performance.now();
  const r = await fetch(BASE + rota, {
    headers: { Authorization: `Api-Key ${chave}`, 'User-Agent': 'Kairos-APS/0.1 (projeto academico)' },
  });
  const ms = Math.round(performance.now() - inicio);
  const corpo = await r.text();
  if (corpo.includes(chave)) throw new Error('a resposta ecoou a chave; nada foi salvo');
  const cabecalhos = Object.fromEntries(CABECALHOS_GUARDADOS.filter((h) => r.headers.has(h)).map((h) => [h, r.headers.get(h)]));
  const meta = { rota, http: r.status, ms, capturadoEm: new Date().toISOString(), cabecalhos };
  fs.writeFileSync(path.join(aqui, `fixture-${nome}.meta.json`), JSON.stringify(meta, null, 2) + '\n');
  fs.writeFileSync(path.join(aqui, `fixture-${nome}.json`), corpo.endsWith('\n') ? corpo : corpo + '\n');
  console.log(`${rota} -> HTTP ${r.status} em ${ms} ms, ${corpo.length} bytes`, JSON.stringify(cabecalhos));
}
