// Spike T04 — SPTrans Olho Vivo API v2.1
// Uso (a partir de spikes/olho-vivo): node --env-file=../../.env spike.mjs
// Nunca imprime o token nem grava cookies de sessão.
import { writeFile, readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const BASE = 'https://api.olhovivo.sptrans.com.br/v2.1';
const UA = 'Kairos-APS-Spike/0.1 (projeto academico)';
const TOKEN = process.env.SPTRANS_TOKEN;

const agora = () =>
  new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }) + ' (America/Sao_Paulo)';

if (!TOKEN) {
  console.error('SPTRANS_TOKEN ausente no ambiente. Abortando.');
  process.exit(1);
}

const medicoes = [];
let cookie = ''; // somente em memória

function semToken(s) {
  return String(s).split(TOKEN).join('***');
}

async function chamar(nome, path, { method = 'GET', comCookie = true, binario = false } = {}) {
  const url = BASE + path;
  const headers = { 'User-Agent': UA };
  if (comCookie && cookie) headers.Cookie = cookie;
  const t0 = performance.now();
  let res, corpo, erro;
  try {
    res = await fetch(url, { method, headers, redirect: 'manual' });
    corpo = binario ? Buffer.from(await res.arrayBuffer()) : await res.text();
  } catch (e) {
    erro = String(e?.cause?.code || e?.message || e);
  }
  const ms = Math.round(performance.now() - t0);
  const m = {
    nome,
    metodo: method,
    endpoint: semToken(path),
    quando: agora(),
    latenciaMs: ms,
    status: res?.status ?? null,
    contentType: res?.headers.get('content-type') ?? null,
    bytes: corpo ? (binario ? corpo.length : Buffer.byteLength(corpo)) : 0,
    erro: erro ?? null,
  };
  medicoes.push(m);
  console.log(
    `[${m.quando}] ${nome}: ${method} ${m.endpoint} -> ${m.status ?? 'ERRO ' + erro} | ${ms} ms | ${m.bytes} B | ${m.contentType}`,
  );
  return { res, corpo, m };
}

function json(corpo) {
  try {
    return JSON.parse(corpo);
  } catch {
    return undefined;
  }
}

const resumo = { inicio: agora() };

// 7) Chamada sem sessão (antes de autenticar, sem cookie)
{
  const { corpo, m } = await chamar('sem-sessao', '/Linha/Buscar?termosBusca=875A', { comCookie: false });
  resumo.semSessao = { status: m.status, contentType: m.contentType, corpo: semToken(corpo ?? '').slice(0, 500) };
  console.log('  corpo sem sessão:', resumo.semSessao.corpo);
}

// 1) Autenticar
{
  const { res, corpo, m } = await chamar('login', `/Login/Autenticar?token=${encodeURIComponent(TOKEN)}`, {
    method: 'POST',
    comCookie: false,
  });
  const setCookies = res?.headers.getSetCookie?.() ?? [];
  cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
  const nomesCookies = setCookies.map((c) => c.split('=')[0]);
  const atributos = setCookies.map((c) =>
    c
      .split(';')
      .slice(1)
      .map((a) => a.trim().split('=')[0])
      .join(','),
  );
  resumo.login = { status: m.status, corpo: semToken(corpo ?? '').slice(0, 200), nomesCookies, atributosCookies: atributos };
  console.log('  corpo login:', resumo.login.corpo, '| cookies recebidos (só nomes):', nomesCookies.join(', ') || '(nenhum)');
  if (corpo?.trim() !== 'true') {
    console.error('Autenticação recusada ou falhou. Parando sem gerar fixtures.');
    await writeFile(join(DIR, 'resultado-execucao.json'), JSON.stringify({ resumo, medicoes }, null, 2));
    process.exit(2);
  }
}

// 2) Buscar linhas 875A
const { corpo: cLinhas } = await chamar('linhas', '/Linha/Buscar?termosBusca=875A');
const linhas = json(cLinhas);
if (!Array.isArray(linhas) || linhas.length === 0) {
  console.error('Nenhuma linha retornada:', semToken(cLinhas).slice(0, 300));
  await writeFile(join(DIR, 'resultado-execucao.json'), JSON.stringify({ resumo, medicoes }, null, 2));
  process.exit(3);
}
await writeFile(join(DIR, 'fixture-linhas.json'), JSON.stringify(linhas, null, 2));
console.log('  linhas:', linhas.map((l) => `cl=${l.cl} ${l.lt}-${l.tl} sl=${l.sl} (${l.tp} / ${l.ts})`).join(' | '));

// 3) Paradas da primeira linha
const linha = linhas[0];
const { corpo: cParadas } = await chamar('paradas', `/Parada/BuscarParadasPorLinha?codigoLinha=${linha.cl}`);
const paradas = json(cParadas) ?? [];
await writeFile(join(DIR, 'fixture-paradas.json'), JSON.stringify(paradas, null, 2));
console.log(`  paradas da linha cl=${linha.cl}: ${paradas.length}`);

// 4) Previsão: tenta até 3 paradas (meio do trajeto primeiro) até achar veículos
const candidatas = [];
if (paradas.length) {
  const meio = Math.floor(paradas.length / 2);
  for (const i of [meio, Math.floor(paradas.length / 4), Math.floor((3 * paradas.length) / 4)])
    if (paradas[i] && !candidatas.includes(paradas[i])) candidatas.push(paradas[i]);
}
let previsao = null;
let paradaEscolhida = null;
for (const p of candidatas) {
  const { corpo } = await chamar('previsao', `/Previsao?codigoParada=${p.cp}&codigoLinha=${linha.cl}`);
  const j = json(corpo);
  previsao = j ?? semToken(corpo);
  paradaEscolhida = p;
  const nVeic = j?.p?.l?.reduce((s, l) => s + (l.vs?.length ?? 0), 0) ?? 0;
  console.log(`  previsão parada cp=${p.cp} (${p.np}): hr=${j?.hr} veículos=${nVeic}`);
  if (nVeic > 0) break;
}
await writeFile(join(DIR, 'fixture-previsao.json'), JSON.stringify(previsao, null, 2));
resumo.previsao = {
  linha: { cl: linha.cl, lt: linha.lt, tl: linha.tl, sl: linha.sl },
  parada: paradaEscolhida && { cp: paradaEscolhida.cp, np: paradaEscolhida.np },
  hr: previsao?.hr,
  veiculos: previsao?.p?.l?.reduce((s, l) => s + (l.vs?.length ?? 0), 0) ?? 0,
};

// 4b) /Previsao/Parada (todas as linhas da parada) — uma chamada
if (paradaEscolhida) {
  const { corpo } = await chamar('previsao-parada', `/Previsao/Parada?codigoParada=${paradaEscolhida.cp}`);
  const j = json(corpo);
  if (j) await writeFile(join(DIR, 'fixture-previsao-parada.json'), JSON.stringify(j, null, 2));
  resumo.previsaoParada = {
    hr: j?.hr,
    linhas: j?.p?.l?.length ?? 0,
    veiculos: j?.p?.l?.reduce((s, l) => s + (l.vs?.length ?? 0), 0) ?? 0,
  };
}

// 5) KMZ
resumo.kmz = [];
for (const [nome, path] of [
  ['kmz', '/KMZ'],
  ['kmz-corredor', '/KMZ/Corredor'],
  ['kmz-outrasvias', '/KMZ/OutrasVias'],
]) {
  const { corpo, m } = await chamar(nome, path, { binario: true });
  const assinatura = corpo?.subarray(0, 4).toString('hex');
  const ehZip = assinatura === '504b0304';
  let arquivo = null;
  if (corpo?.length && m.status === 200) {
    arquivo = `${nome}.kmz`;
    await writeFile(join(DIR, arquivo), corpo);
  }
  resumo.kmz.push({ nome, status: m.status, bytes: m.bytes, contentType: m.contentType, assinaturaHex: assinatura, ehZip, arquivo });
  console.log(`  ${nome}: assinatura=${assinatura} zip=${ehZip}`);
  if (!ehZip && corpo?.length) console.log('  início do corpo:', semToken(corpo.subarray(0, 200).toString('utf8')));
}

resumo.fim = agora();
await writeFile(join(DIR, 'resultado-execucao.json'), JSON.stringify({ resumo, medicoes }, null, 2));

// Verificação: nenhum arquivo da pasta contém o token
let vazou = false;
for (const f of await readdir(DIR)) {
  const p = join(DIR, f);
  if (!(await stat(p)).isFile()) continue;
  const conteudo = await readFile(p);
  if (conteudo.includes(Buffer.from(TOKEN))) {
    vazou = true;
    console.error('ATENÇÃO: token encontrado em', f);
  }
}
console.log(vazou ? 'Verificação de token: FALHOU' : 'Verificação de token: nenhum arquivo da pasta contém o token.');
