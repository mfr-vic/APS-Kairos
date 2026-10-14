// Spike T06 (RF21) — status das linhas do Metrô via iframe do "Direto do Metrô".
// Uso: node spikes/metro-cptm/spike.mjs [saida.json]
// Faz UMA requisição. Não há API oficial: isto extrai do HTML renderizado no servidor.
// CPTM não é coberta: www.cptm.sp.gov.br responde com desafio anti-bot (Imperva/Incapsula).
import { writeFileSync } from 'node:fs';

const URL_FONTE = 'https://www.metro.sp.gov.br/wp-content/themes/metrosp/direto-metro.php?embed=1';
const UA = 'Kairos-APS/0.1 (projeto academico; contato: mfr.vic@gmail.com)';
const LINHAS_RF21 = new Set(['1', '2', '3', '15']);

const decode = (s) =>
  s.replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

export function parseDiretoMetro(html) {
  const re =
    /<li class="linha[^"]*">\s*<div class="linha-numero"[^>]*>([^<]*)<\/div>\s*<div class="linha-nome">([^<]*)<\/div>\s*<div class="linha-situacao"[^>]*>([^<]*)<\/div>\s*<div class="linha-info[^"]*"[^>]*data-bs-title="([^"]*)"/g;
  const linhas = [];
  for (const m of html.matchAll(re)) {
    const tip = decode(m[4]);
    const pick = (cls) => (tip.match(new RegExp(`<div class='${cls}'[^>]*>([\\s\\S]*?)</div>`)) || [])[1]?.trim() ?? null;
    const cor = (tip.match(/background-color:\s*(#[0-9A-Fa-f]{6})/) || [])[1] ?? null;
    const data = pick('date');
    linhas.push({
      numero: m[1].trim(),
      nome: decode(m[2]),
      situacao: decode(m[3]),
      operadora_ou_titulo: pick('title'),
      descricao: pick('description'),
      atualizado_em: data ? data.replace(/^\(atualizado em\s*/, '').replace(/\)$/, '') : null,
      cor_indicador: cor,
    });
  }
  return linhas;
}

const resp = await fetch(URL_FONTE, { headers: { 'User-Agent': UA } });
if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
const html = await resp.text();
const linhas = parseDiretoMetro(html);
if (linhas.length === 0) throw new Error('Nenhuma linha extraída — o layout pode ter mudado.');

const saida = {
  fonte: URL_FONTE,
  coletado_em: new Date().toISOString(),
  coletado_em_sp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
  http_status: resp.status,
  linhas_rf21_presentes: linhas.filter((l) => LINHAS_RF21.has(l.numero)).map((l) => l.numero),
  linhas,
};
const json = JSON.stringify(saida, null, 2);
if (process.argv[2]) writeFileSync(process.argv[2], json + '\n');
console.log(json);
