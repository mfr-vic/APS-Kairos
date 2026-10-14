// Spike T03 — Open-Meteo (Forecast API + Air Quality API) para São Paulo.
// Uso: node spikes/open-meteo/spike.mjs   (Node 24, sem dependências)
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const USER_AGENT = 'Kairos-APS/0.1 (projeto academico; contato: mfr.vic@gmail.com)';

// Praça da Sé, São Paulo
const LAT = -23.5505;
const LON = -46.6333;
const TZ = 'America/Sao_Paulo';

const forecastUrl =
  'https://api.open-meteo.com/v1/forecast' +
  `?latitude=${LAT}&longitude=${LON}` +
  '&current=temperature_2m,precipitation,rain,weather_code' +
  '&hourly=temperature_2m,precipitation,precipitation_probability,weather_code' +
  `&timezone=${encodeURIComponent(TZ)}` +
  '&forecast_days=2';

const airQualityUrl =
  'https://air-quality-api.open-meteo.com/v1/air-quality' +
  `?latitude=${LAT}&longitude=${LON}` +
  '&current=pm2_5,pm10,european_aqi,us_aqi' +
  '&hourly=pm2_5,pm10,european_aqi,us_aqi,us_aqi_pm2_5' +
  `&timezone=${encodeURIComponent(TZ)}` +
  '&forecast_days=2';

function agoraSP() {
  return new Date().toLocaleString('sv-SE', { timeZone: TZ }) + ' (America/Sao_Paulo)';
}

async function medir(nome, url, arquivo) {
  const inicio = agoraSP();
  const t0 = performance.now();
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  const corpo = await res.text();
  const ms = performance.now() - t0;
  console.log(`[${nome}] ${inicio}`);
  console.log(`  URL: ${url}`);
  console.log(`  HTTP ${res.status} — latência ${ms.toFixed(0)} ms — ${corpo.length} bytes`);
  if (!res.ok) throw new Error(`${nome}: HTTP ${res.status} ${corpo.slice(0, 300)}`);
  const json = JSON.parse(corpo);
  await writeFile(join(here, arquivo), JSON.stringify(json, null, 2) + '\n', 'utf8');
  console.log(`  salvo em ${arquivo}`);
  return json;
}

const fc = await medir('forecast', forecastUrl, 'fixture-forecast.json');
console.log('  timezone:', fc.timezone, '| utc_offset_seconds:', fc.utc_offset_seconds,
  '| grid:', fc.latitude, fc.longitude, '| elevation:', fc.elevation);
console.log('  current:', JSON.stringify(fc.current));
console.log('  current_units:', JSON.stringify(fc.current_units));
console.log('  hourly_units:', JSON.stringify(fc.hourly_units));
console.log('  hourly: ', fc.hourly.time.length, 'horas,', fc.hourly.time[0], '→', fc.hourly.time.at(-1));
console.log('  precipitation_probability (primeiras 6h):', fc.hourly.precipitation_probability.slice(0, 6).join(', '));

const aq = await medir('air-quality', airQualityUrl, 'fixture-air-quality.json');
console.log('  timezone:', aq.timezone, '| grid:', aq.latitude, aq.longitude);
console.log('  current:', JSON.stringify(aq.current));
console.log('  current_units:', JSON.stringify(aq.current_units));
console.log('  hourly_units:', JSON.stringify(aq.hourly_units));
console.log('  hourly: ', aq.hourly.time.length, 'horas,', aq.hourly.time[0], '→', aq.hourly.time.at(-1));
const nulos = Object.fromEntries(
  Object.entries(aq.hourly).filter(([k]) => k !== 'time').map(([k, v]) => [k, v.filter((x) => x === null).length]),
);
console.log('  valores nulos por variável horária:', JSON.stringify(nulos));
