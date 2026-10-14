// Itinerário das linhas de trilho: funções puras de geometria e de nomes.
// SEM imports: o script `scripts/gerar-estacoes.mjs` importa este arquivo direto no Node 24
// (remoção de tipos nativa); use só sintaxe TypeScript apagável (nada de enum/namespace).

export type Coordenada = { lat: number; lon: number };

const RAIO_TERRA_M = 6_371_000;
const rad = (g: number) => (g * Math.PI) / 180;

/** Distância em metros entre dois pontos WGS84 (haversine). */
export function distanciaM(a: Coordenada, b: Coordenada): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * RAIO_TERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Chave de comparação de nomes de estação entre fontes: sem acentos, minúsculas, sem o sufixo
 * "(LINHA 8)" do GeoSampa, hífens/barras/pontos viram espaço ("Palmeiras - Barra Funda" =
 * "Palmeiras-Barra Funda", "SESC POMPEIA" = "SESC-Pompéia").
 */
export function normalizarNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(linha \d+\)/g, ' ')
    .replace(/[-–/.,']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Posição de um ponto ao longo de uma polilinha, em metros desde o 1º vértice (projeção no
 * segmento mais próximo). Plano local equiretangular: erro desprezível na escala de uma linha
 * de metrô (dezenas de km).
 */
export function posicaoNaPolilinha(ponto: Coordenada, polilinha: readonly Coordenada[]): number {
  if (polilinha.length < 2) throw new Error('polilinha precisa de 2 vértices ou mais');
  const lat0 = rad(polilinha[0].lat);
  const xy = (p: Coordenada) => ({
    x: rad(p.lon) * Math.cos(lat0) * RAIO_TERRA_M,
    y: rad(p.lat) * RAIO_TERRA_M,
  });
  const p = xy(ponto);
  let acumulado = 0;
  let melhor = { dist: Infinity, pos: 0 };
  for (let i = 0; i < polilinha.length - 1; i++) {
    const a = xy(polilinha[i]);
    const b = xy(polilinha[i + 1]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t =
      len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const qx = a.x + t * dx;
    const qy = a.y + t * dy;
    const dist = Math.hypot(p.x - qx, p.y - qy);
    const len = Math.sqrt(len2);
    if (dist < melhor.dist) melhor = { dist, pos: acumulado + t * len };
    acumulado += len;
  }
  return melhor.pos;
}

/** Ordena itens com coordenada ao longo da polilinha (do 1º ao último vértice). */
export function ordenarPelaPolilinha<T extends { coordenada: Coordenada }>(
  itens: readonly T[],
  polilinha: readonly Coordenada[]
): T[] {
  return itens
    .map((item) => ({ item, pos: posicaoNaPolilinha(item.coordenada, polilinha) }))
    .sort((a, b) => a.pos - b.pos)
    .map((x) => x.item);
}
