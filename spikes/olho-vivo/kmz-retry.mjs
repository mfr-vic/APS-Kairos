// Spike T04 — nova tentativa dos KMZ com sentido (BC), após 500 na primeira execução.
// Uso: node --env-file=../../.env kmz-retry.mjs [/KMZ/BC ...]
// No Git Bash, prefixe MSYS_NO_PATHCONV=1 ao passar caminhos como argumentos.
import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const BASE = 'https://api.olhovivo.sptrans.com.br/v2.1';
const UA = 'Kairos-APS-Spike/0.1 (projeto academico)';
const TOKEN = process.env.SPTRANS_TOKEN;
if (!TOKEN) process.exit(1);
const agora = () => new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' });

const login = await fetch(`${BASE}/Login/Autenticar?token=${encodeURIComponent(TOKEN)}`, {
  method: 'POST',
  headers: { 'User-Agent': UA },
});
const ok = (await login.text()).trim();
const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
console.log(`[${agora()}] login -> ${login.status} ${ok}`);
if (ok !== 'true') process.exit(2);

const out = [];
for (const path of process.argv.slice(2).length ? process.argv.slice(2) : ['/KMZ/Corredor/BC', '/KMZ/BC']) {
  const t0 = performance.now();
  const r = await fetch(BASE + path, { headers: { 'User-Agent': UA, Cookie: cookie } });
  const buf = Buffer.from(await r.arrayBuffer());
  const ms = Math.round(performance.now() - t0);
  const assin = buf.subarray(0, 4).toString('hex');
  const m = { quando: agora(), path, status: r.status, ms, bytes: buf.length, contentType: r.headers.get('content-type'), assinaturaHex: assin, ehZip: assin === '504b0304' };
  out.push(m);
  console.log(JSON.stringify(m));
  if (m.ehZip) {
    const nome = 'kmz' + path.replace(/^\/KMZ/, '').replace(/\//g, '-').toLowerCase() + '.kmz';
    await writeFile(join(DIR, nome), buf);
    console.log('  salvo como', nome);
  } else console.log('  corpo:', buf.subarray(0, 200).toString('utf8'));
}
// Acrescenta as tentativas ao log consolidado resultado-kmz.json
const arq = join(DIR, 'resultado-kmz.json');
let log = { fusoHorario: 'America/Sao_Paulo', tentativas: [] };
try {
  log = JSON.parse(await readFile(arq, 'utf8'));
} catch {}
log.tentativas.push(...out.map((m) => ({ ...m, origem: 'kmz-retry.mjs' })));
await writeFile(arq, JSON.stringify(log, null, 2));
