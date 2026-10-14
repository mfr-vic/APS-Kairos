// TC31 / RNF01: latência do briefing com cache quente. 1 aquecimento + 30 POST /v1/briefings em sequência com o
// exemplo do contrato, contra a API já no ar (não sobe nada). Imprime p50/p95/max medidos no cliente.
// Uso: node --import tsx scripts/medir-latencia.ts [baseUrl]   (padrão http://localhost:3000)
// Orçamento: o exemplo tem L4 → com ARTESP_KEY no servidor, no máximo 1 chamada à ARTESP (TTL 6 min).
import { readFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const N = 30;
const corpo = readFileSync(new URL('../../../packages/contracts/examples/briefing-request.json', import.meta.url), 'utf8');

/** Percentil pelo método do posto mais próximo (nearest-rank). */
function percentil(ordenados: number[], p: number): number {
  return ordenados[Math.max(0, Math.ceil((p / 100) * ordenados.length) - 1)]!;
}

async function briefing() {
  const inicio = performance.now();
  const res = await fetch(`${BASE}/v1/briefings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: corpo });
  const json = (await res.json()) as { veredito?: string; observacoes?: { dimension: string; status: string }[] };
  return { ms: performance.now() - inicio, status: res.status, json };
}

const aquecimento = await briefing();
console.log(`${new Date().toISOString()} ${BASE}`);
console.log(`aquecimento: HTTP ${aquecimento.status} em ${aquecimento.ms.toFixed(1)} ms`);

const tempos: number[] = [];
const codigos = new Map<number, number>();
let ultimo = aquecimento.json;
for (let i = 0; i < N; i++) {
  const r = await briefing();
  tempos.push(r.ms);
  codigos.set(r.status, (codigos.get(r.status) ?? 0) + 1);
  ultimo = r.json;
}
const ord = [...tempos].sort((a, b) => a - b);
console.log(`n=${N} HTTP ${[...codigos].map(([c, q]) => `${c}×${q}`).join(' ')}`);
console.log(`p50=${percentil(ord, 50).toFixed(1)} ms  p95=${percentil(ord, 95).toFixed(1)} ms  max=${ord.at(-1)!.toFixed(1)} ms  min=${ord[0]!.toFixed(1)} ms`);
console.log(`último: ${ultimo.veredito} · ${(ultimo.observacoes ?? []).map((o) => `${o.dimension}=${o.status}`).join(' ')}`);
