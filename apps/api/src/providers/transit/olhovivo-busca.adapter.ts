// Buscas do Olho Vivo usadas na configuração do trajeto (T18, RF02). Não são dimensões do briefing:
// rodam por ProviderRunner.execute (cache, breaker compartilhado com a previsão, timeout).
import type { BusLinesResponse, BusStopsResponse } from '@kairos/contracts';
import type { Provider, ProviderFetchContext, ProviderResult } from '../../infrastructure/provider.js';
import { OLHO_VIVO_SOURCE, type OlhoVivoClient } from './olhovivo.client.js';
import {
  OlhoVivoLinhasSchema,
  OlhoVivoParadasSchema,
  type OlhoVivoLinha,
  type OlhoVivoParada,
} from './olhovivo.schemas.js';

// [DECISÃO DE PROJETO] Linhas e paradas mudam raramente; a C.5 não fixa TTL para elas
const TTL_BUSCA_S = 24 * 60 * 60;

export function mapearLinhas(raw: OlhoVivoLinha[]): BusLinesResponse {
  return {
    linhas: raw.map((l) => ({
      codigoLinha: l.cl,
      letreiro: `${l.lt}-${l.tl}`, // ex.: "875A-10"
      sentido: l.sl,
      terminalPrincipal: l.tp,
      terminalSecundario: l.ts,
    })),
  };
}

export function mapearParadas(raw: OlhoVivoParada[]): BusStopsResponse {
  return {
    paradas: raw.map((p) => ({
      codigoParada: p.cp,
      nome: p.np,
      endereco: p.ed?.trim() ? p.ed.trim() : null,
      lat: p.py,
      lon: p.px,
    })),
  };
}

/** GET /Linha/Buscar?termosBusca= (ex.: "875A" → os dois sentidos). */
export class OlhoVivoBuscaLinhasAdapter implements Provider<string, BusLinesResponse> {
  readonly source = OLHO_VIVO_SOURCE;
  readonly ttlSeconds = TTL_BUSCA_S;
  readonly timeoutMs = 3_000;

  constructor(private readonly client: OlhoVivoClient) {}

  cacheKey(termo: string): string {
    return `linhas:${termo.trim().toLowerCase()}`;
  }

  async fetch(termo: string, ctx: ProviderFetchContext): Promise<ProviderResult<BusLinesResponse>> {
    const raw = await this.client.getJson(
      `/Linha/Buscar?termosBusca=${encodeURIComponent(termo.trim())}`,
      OlhoVivoLinhasSchema,
      { signal: ctx.signal },
    );
    return { value: mapearLinhas(raw) };
  }
}

/** GET /Parada/BuscarParadasPorLinha?codigoLinha= (a lista não é o itinerário ordenado; ver spike T04). */
export class OlhoVivoBuscaParadasAdapter implements Provider<number, BusStopsResponse> {
  readonly source = OLHO_VIVO_SOURCE;
  readonly ttlSeconds = TTL_BUSCA_S;
  readonly timeoutMs = 3_000;

  constructor(private readonly client: OlhoVivoClient) {}

  cacheKey(codigoLinha: number): string {
    return `paradas:${codigoLinha}`;
  }

  async fetch(codigoLinha: number, ctx: ProviderFetchContext): Promise<ProviderResult<BusStopsResponse>> {
    const raw = await this.client.getJson(
      `/Parada/BuscarParadasPorLinha?codigoLinha=${encodeURIComponent(codigoLinha)}`,
      OlhoVivoParadasSchema,
      { signal: ctx.signal },
    );
    return { value: mapearParadas(raw) };
  }
}
