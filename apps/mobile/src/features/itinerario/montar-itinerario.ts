// Itinerário de uma linha de trilho para um trajeto (funções puras).
// Embarque = estação mais próxima da ORIGEM; desembarque = mais próxima do DESTINO; o sentido é o
// do terminal para onde se vai (do embarque ao desembarque). "Trocar sentido" inverte.
import { distanciaM, type Coordenada } from './geometria';

export type Estacao = {
  nome: string;
  coordenada: Coordenada | null;
  /** Ponto da camada de estações PROJETADAS do GeoSampa (estação nova, fora da camada de operação). */
  coordenadaDeProjeto?: boolean;
};

/** Além disto, a estação "mais próxima" não serve como embarque/desembarque (pedido de 14/10/2026). */
export const LONGE_DA_LINHA_M = 2000;

export type Proxima = { indice: number; distanciaM: number };

/** Estação com coordenada mais perto do ponto (ignora as sem coordenada); null se nenhuma tem. */
export function estacaoMaisProxima(
  estacoes: readonly Estacao[],
  ponto: Coordenada
): Proxima | null {
  let melhor: Proxima | null = null;
  for (let indice = 0; indice < estacoes.length; indice++) {
    const c = estacoes[indice].coordenada;
    if (!c) continue;
    const d = distanciaM(c, ponto);
    if (!melhor || d < melhor.distanciaM) melhor = { indice, distanciaM: d };
  }
  return melhor;
}

export type Itinerario = {
  /** Estações na ordem do sentido escolhido (a 1ª é o terminal de partida). */
  estacoes: Estacao[];
  /** Terminal para onde o trem vai neste sentido (destaque do topo). */
  terminal: string;
  /** Índices em `estacoes`; null quando a origem/destino fica longe da linha (ou sem coordenadas). */
  embarque: number | null;
  desembarque: number | null;
  /** Distâncias reais às estações mais próximas, mesmo quando longe (para explicar o porquê). */
  origemAteLinhaM: number | null;
  destinoAteLinhaM: number | null;
  /** Estações percorridas do embarque ao desembarque (paradas após embarcar); null sem trecho. */
  paradas: number | null;
  /** Nenhuma estação da linha tem coordenada: não dá para inferir embarque nem sentido. */
  semCoordenadas: boolean;
};

/**
 * Monta o itinerário. `trocado` = a pessoa tocou "Trocar sentido" (inverte o sentido inferido).
 * Sem embarque E desembarque distintos, o sentido inferido é o da ordem da fonte.
 */
export function montarItinerario(
  ordemDaFonte: readonly Estacao[],
  origem: Coordenada,
  destino: Coordenada,
  trocado: boolean
): Itinerario {
  const pertoOrigem = estacaoMaisProxima(ordemDaFonte, origem);
  const pertoDestino = estacaoMaisProxima(ordemDaFonte, destino);
  const serve = (p: Proxima | null) => (p && p.distanciaM <= LONGE_DA_LINHA_M ? p.indice : null);
  const emb = serve(pertoOrigem);
  const des = serve(pertoDestino);

  const inferidoInverso = emb !== null && des !== null && des < emb;
  const inverso = inferidoInverso !== trocado;
  const n = ordemDaFonte.length;
  const noSentido = (i: number | null) => (i === null ? null : inverso ? n - 1 - i : i);
  const estacoes = inverso ? [...ordemDaFonte].reverse() : [...ordemDaFonte];
  const embarque = noSentido(emb);
  const desembarque = noSentido(des);

  return {
    estacoes,
    terminal: estacoes[n - 1]?.nome ?? '',
    embarque,
    desembarque,
    origemAteLinhaM: pertoOrigem?.distanciaM ?? null,
    destinoAteLinhaM: pertoDestino?.distanciaM ?? null,
    paradas:
      embarque !== null && desembarque !== null && embarque !== desembarque
        ? Math.abs(desembarque - embarque)
        : null,
    semCoordenadas: pertoOrigem === null,
  };
}

/** O trecho (embarque..desembarque, inclusive) contém a estação `i`? Sem trecho, nada está nele. */
export function noTrecho(it: Pick<Itinerario, 'embarque' | 'desembarque'>, i: number): boolean {
  if (it.embarque === null || it.desembarque === null || it.embarque === it.desembarque)
    return false;
  const [a, b] = [Math.min(it.embarque, it.desembarque), Math.max(it.embarque, it.desembarque)];
  return i >= a && i <= b;
}

export type PapelEstacao = 'embarque' | 'desembarque' | 'trecho' | 'fora';

export function papelDaEstacao(it: Itinerario, i: number): PapelEstacao {
  if (i === it.embarque) return 'embarque';
  if (i === it.desembarque) return 'desembarque';
  return noTrecho(it, i) ? 'trecho' : 'fora';
}

export const LEGENDA_PAPEL: Record<Exclude<PapelEstacao, 'fora'>, string> = {
  embarque: 'Estação mais próxima da origem',
  desembarque: 'Mais próxima do destino',
  trecho: 'entre o embarque e o desembarque',
};

/** Rótulo de leitura de tela: "Paraíso, 7ª estação, entre o embarque e o desembarque". */
export function rotuloEstacao(it: Itinerario, i: number): string {
  const e = it.estacoes[i];
  const partes = [e.nome, `${i + 1}ª estação`];
  const papel = papelDaEstacao(it, i);
  if (papel === 'embarque') partes.push('embarque, estação mais próxima da origem');
  else if (papel === 'desembarque') partes.push('desembarque, estação mais próxima do destino');
  else if (papel === 'trecho') partes.push(LEGENDA_PAPEL.trecho);
  if (i === it.estacoes.length - 1) partes.push('terminal');
  if (!e.coordenada) partes.push('sem localização conhecida');
  return partes.join(', ');
}
