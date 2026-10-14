// Registro de requisições (item 7, 13/10): anel em memória com as últimas chamadas do app à API.
// Mostra a ponta do CLIENTE do sistema distribuído (latência de ida e volta, erros de rede/prazo/
// contrato e dimensões degradadas); a ponta do servidor vem de /v1/health/providers.
// Só em memória: some ao fechar o app e nunca guarda a query (endereços e coordenadas da pessoa).
import { useSyncExternalStore } from 'react';

import type { TipoErroApi } from './errors';

export const CAPACIDADE_REGISTRO = 50;

export type EntradaRegistro = {
  id: number;
  /** Epoch ms do início da requisição. */
  em: number;
  metodo: 'GET' | 'POST';
  /** Caminho sem a query string. */
  rota: string;
  /** Status HTTP quando houve resposta; null em falha de rede/prazo. */
  status: number | null;
  /** null = sucesso (2xx e dentro do contrato). */
  erro: TipoErroApi | 'cancelada' | null;
  latenciaMs: number;
  /** Bytes do corpo lido; null se não houve corpo. */
  bytes: number | null;
  /** Dimensões que vieram stale/unavailable (só respostas com `observacoes`, ex.: briefing). */
  degradadas: { stale: string[]; unavailable: string[] } | null;
};

let entradas: readonly EntradaRegistro[] = [];
let proximoId = 1;
const ouvintes = new Set<() => void>();

function avisar() {
  ouvintes.forEach((o) => o());
}

/** Tira a query (?q=endereço, ?lat=&lon=) para o registro nunca guardar dado pessoal. */
export function rotaSemQuery(caminho: string): string {
  return caminho.split('?')[0] ?? caminho;
}

/** Lista as dimensões stale/unavailable de uma resposta com `observacoes`; null se não houver. */
export function dimensoesDegradadas(json: unknown): EntradaRegistro['degradadas'] {
  const obs = (json as { observacoes?: unknown } | null)?.observacoes;
  if (!Array.isArray(obs)) return null;
  const de = (s: string) =>
    obs
      .filter((o): o is { dimension: string; status: string } => o?.status === s)
      .map((o) => o.dimension);
  return { stale: de('stale'), unavailable: de('unavailable') };
}

export function registrar(e: Omit<EntradaRegistro, 'id'>): void {
  entradas = [{ ...e, id: proximoId++ }, ...entradas].slice(0, CAPACIDADE_REGISTRO);
  avisar();
}

/** Esvazia o registro e devolve o que havia (para o Desfazer). */
export function limparRegistro(): readonly EntradaRegistro[] {
  const anteriores = entradas;
  entradas = [];
  avisar();
  return anteriores;
}

/** Desfazer da limpeza: devolve as entradas antigas, mantendo as que chegaram depois. */
export function restaurarRegistro(anteriores: readonly EntradaRegistro[]): void {
  entradas = [...entradas, ...anteriores].slice(0, CAPACIDADE_REGISTRO);
  avisar();
}

export function lerRegistro(): readonly EntradaRegistro[] {
  return entradas;
}

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

/** Entradas mais recentes primeiro; re-renderiza a cada requisição. */
export function useRegistro(): readonly EntradaRegistro[] {
  return useSyncExternalStore(assinar, lerRegistro, lerRegistro);
}

export type ResumoRota = { rota: string; total: number; sucesso: number; latenciaMediaMs: number };

/** Totais do registro: taxa de sucesso geral e latência média por rota (canceladas ficam de fora). */
export function resumirRegistro(lista: readonly EntradaRegistro[]): {
  total: number;
  sucesso: number;
  taxaSucesso: number | null;
  porRota: ResumoRota[];
} {
  const validas = lista.filter((e) => e.erro !== 'cancelada');
  const sucesso = validas.filter((e) => e.erro === null).length;
  const mapa = new Map<string, { total: number; sucesso: number; somaMs: number }>();
  for (const e of validas) {
    const r = mapa.get(e.rota) ?? { total: 0, sucesso: 0, somaMs: 0 };
    r.total += 1;
    r.somaMs += e.latenciaMs;
    if (e.erro === null) r.sucesso += 1;
    mapa.set(e.rota, r);
  }
  const porRota = [...mapa]
    .map(([rota, r]) => ({ rota, total: r.total, sucesso: r.sucesso, latenciaMediaMs: Math.round(r.somaMs / r.total) }))
    .sort((a, b) => b.total - a.total || a.rota.localeCompare(b.rota));
  return {
    total: validas.length,
    sucesso,
    taxaSucesso: validas.length === 0 ? null : Math.round((sucesso / validas.length) * 100),
    porRota,
  };
}
