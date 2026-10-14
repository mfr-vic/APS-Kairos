// GET /v1/transit/rail/lines (RF03, TC04): só as linhas com fonte configurada.
// Sem chave ARTESP: 1, 2, 3, 4, 5 e 15 da página "Direto do Metrô" (RF21, T34).
// Com chave (T19): 4–9 da ARTESP (RF09) e 1, 2, 3 e 15 da página. CPTM (10–13) fica de fora (anti-bot, spike T06).
import type { FastifyPluginAsync } from 'fastify';
import { RailLinesResponseSchema, type RailLinesResponse } from '@kairos/contracts';

type LinhaInfo = RailLinesResponse['linhas'][number];

/** Linhas da página do Metrô (nomes e operadoras como a própria página mostra em 10/10/2026). */
export const LINHAS_TRILHO_METRO_SP: readonly LinhaInfo[] = [
  { linha: 'L1', nome: 'Azul', operadora: 'Metrô' },
  { linha: 'L2', nome: 'Verde', operadora: 'Metrô' },
  { linha: 'L3', nome: 'Vermelha', operadora: 'Metrô' },
  { linha: 'L4', nome: 'Amarela', operadora: 'ViaQuatro' },
  { linha: 'L5', nome: 'Lilás', operadora: 'ViaMobilidade' },
  { linha: 'L15', nome: 'Prata', operadora: 'Metrô' },
];

/** Linhas da ARTESP com as operadoras como a API Trilhos as nomeia (spike T05, 13/10/2026). */
export const LINHAS_TRILHO_ARTESP: readonly LinhaInfo[] = [
  { linha: 'L4', nome: 'Amarela', operadora: 'ViaQuatro' },
  { linha: 'L5', nome: 'Lilás', operadora: 'ViaMobilidade 5' },
  { linha: 'L6', nome: 'Laranja', operadora: 'Linha Uni' },
  { linha: 'L7', nome: 'Rubi', operadora: 'TIC Trens' },
  { linha: 'L8', nome: 'Diamante', operadora: 'ViaMobilidade 8 e 9' },
  { linha: 'L9', nome: 'Esmeralda', operadora: 'ViaMobilidade 8 e 9' },
];

export interface RailLinesRoutesOptions {
  /** true quando houver ARTESP_KEY no .env do backend. Padrão: false. */
  artespConfigurada?: boolean;
}

const numero = (l: LinhaInfo) => Number(l.linha.slice(1));

export function linhasComFonte(artespConfigurada = false): RailLinesResponse {
  const linhas = artespConfigurada
    ? [...LINHAS_TRILHO_ARTESP, ...LINHAS_TRILHO_METRO_SP.filter((m) => !LINHAS_TRILHO_ARTESP.some((a) => a.linha === m.linha))]
    : [...LINHAS_TRILHO_METRO_SP];
  return RailLinesResponseSchema.parse({ linhas: linhas.sort((a, b) => numero(a) - numero(b)) });
}

export const railLinesRoutes: FastifyPluginAsync<RailLinesRoutesOptions> = async (app, opts) => {
  const resposta = linhasComFonte(opts.artespConfigurada ?? false);
  app.get('/v1/transit/rail/lines', async () => resposta);
};
