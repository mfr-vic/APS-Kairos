// Spike T08 — OSRM (servidor demo) + Nominatim (OSMF) para São Paulo.
// Node 24 puro (fetch nativo). Sem dependências.
// Limite: fila serial com espera >= 1100 ms entre chamadas ao MESMO serviço
// (e, por simplicidade, entre quaisquer chamadas). Poucas chamadas no total.
// Uso: node spikes/osrm-nominatim/spike.mjs

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const UA = 'Kairos-APS/0.1 (projeto academico; contato: mfr.vic@gmail.com)';
const MIN_GAP_MS = 1100; // >= 1 s entre requisições
const REPEAT_GAP_MS = 2500; // espaçamento extra entre repetições para medir latência
const MAX_CALLS = 10; // teto por serviço

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const OSRM = 'https://router.project-osrm.org';
// viewbox = lon1,lat1,lon2,lat2 (município de São Paulo, aproximado)
const VIEWBOX = '-46.83,-23.35,-46.36,-24.01';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lastCall = { nominatim: 0, osrm: 0 };
const callCount = { nominatim: 0, osrm: 0 };
const log = []; // { service, label, url, status, ms, at }

function nowSP() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }) + ' (America/Sao_Paulo)';
}

async function call(service, label, url, extraGap = 0) {
  if (callCount[service] >= MAX_CALLS) throw new Error(`teto de ${MAX_CALLS} chamadas atingido para ${service}`);
  const wait = lastCall[service] + MIN_GAP_MS + extraGap - Date.now();
  if (wait > 0) await sleep(wait);
  callCount[service]++;
  const at = nowSP();
  const t0 = performance.now();
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', 'Accept-Language': 'pt-BR' } });
  const body = await res.text();
  const ms = Math.round(performance.now() - t0);
  lastCall[service] = Date.now();
  log.push({ service, label, url, status: res.status, ms, at, bytes: body.length });
  console.log(`[${at}] ${service.padEnd(9)} ${label.padEnd(26)} HTTP ${res.status} ${String(ms).padStart(5)} ms  ${body.length} B`);
  if (!res.ok) throw new Error(`${service} ${label}: HTTP ${res.status} — ${body.slice(0, 300)}`);
  return JSON.parse(body);
}

const search = (q) =>
  `${NOMINATIM}/search?format=jsonv2&q=${encodeURIComponent(q)}&countrycodes=br&viewbox=${VIEWBOX}&bounded=1&limit=5`;
const reverse = (lat, lon) => `${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18`;
const route = (a, b) =>
  `${OSRM}/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`;

function stats(service, prefix) {
  const xs = log.filter((l) => l.service === service && l.label.startsWith(prefix)).map((l) => l.ms);
  if (!xs.length) return null;
  return { n: xs.length, min: Math.min(...xs), max: Math.max(...xs), media: Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) };
}

async function main() {
  console.log(`Início: ${nowSP()}`);
  console.log(`User-Agent: ${UA}\n`);

  // 1) Geocodificação (Nominatim /search)
  const enderecos = ['Avenida Paulista, 1578, São Paulo', 'Praça da Sé, São Paulo', 'Estação da Luz, São Paulo'];
  const geocode = {};
  for (const q of enderecos) {
    geocode[q] = await call('nominatim', `search: ${q.slice(0, 18)}`, search(q));
  }
  // Repetições espaçadas do MASP (latência mín/máx), total 3 amostras
  for (let i = 2; i <= 3; i++) {
    await call('nominatim', `search: ${enderecos[0].slice(0, 18)}`, search(enderecos[0]), REPEAT_GAP_MS);
  }

  const pick = (arr) => (Array.isArray(arr) && arr.length ? { lat: Number(arr[0].lat), lon: Number(arr[0].lon), nome: arr[0].display_name } : null);
  const masp = pick(geocode[enderecos[0]]);
  const se = pick(geocode[enderecos[1]]);
  console.log('\nMASP →', masp);
  console.log('Sé   →', se);
  for (const q of enderecos) console.log(`  "${q}": ${geocode[q]?.length ?? 0} resultado(s)`);

  // 2) Reverse (ponto: Praça da Sé obtida acima, ou coordenada fixa se falhar)
  const pRev = se ?? { lat: -23.5503, lon: -46.6339 };
  const rev = await call('nominatim', 'reverse', reverse(pRev.lat, pRev.lon));
  console.log('Reverse →', rev.display_name);

  // 3) Rota OSRM (MASP → Sé), 3 amostras espaçadas
  if (!masp || !se) throw new Error('geocodificação não retornou pontos para a rota');
  let rota;
  for (let i = 1; i <= 3; i++) {
    rota = await call('osrm', `route MASP->Se #${i}`, route(masp, se), i > 1 ? REPEAT_GAP_MS : 0);
  }
  const r0 = rota.routes?.[0];
  console.log(`\nOSRM code=${rota.code} distance=${r0?.distance} m duration=${r0?.duration} s pontos=${r0?.geometry?.coordinates?.length}`);

  // Fixtures (respostas reais)
  await writeFile(join(DIR, 'fixture-geocode.json'), JSON.stringify({ capturadoEm: log[0].at, urls: enderecos.map(search), respostas: geocode }, null, 2));
  await writeFile(join(DIR, 'fixture-reverse.json'), JSON.stringify({ capturadoEm: log.find((l) => l.label === 'reverse').at, url: reverse(pRev.lat, pRev.lon), resposta: rev }, null, 2));
  await writeFile(join(DIR, 'fixture-route.json'), JSON.stringify({ capturadoEm: log.find((l) => l.service === 'osrm').at, url: route(masp, se), resposta: rota }, null, 2));

  console.log('\nLatências:');
  console.log('  Nominatim search (MASP, 3x):', stats('nominatim', 'search: Avenida Paulista'));
  console.log('  Nominatim search (todas):   ', stats('nominatim', 'search'));
  console.log('  Nominatim reverse:          ', stats('nominatim', 'reverse'));
  console.log('  OSRM route (3x):            ', stats('osrm', 'route'));
  console.log(`\nChamadas: nominatim=${callCount.nominatim} osrm=${callCount.osrm}`);
  console.log(`Fim: ${nowSP()}`);
}

main().catch((e) => {
  console.error('ERRO:', e.message);
  process.exitCode = 1;
});
