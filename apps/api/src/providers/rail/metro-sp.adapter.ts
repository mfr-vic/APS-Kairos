// Adaptador da página "Direto do Metrô" (T34, RF21): linhas 1, 2, 3, 4, 5 e 15.
// Sem ARTESP_KEY, é a única fonte de trilhos; com a chave (T19), cobre 1, 2, 3 e 15 e serve de fonte
// alternativa para 4 e 5 quando a ARTESP falha (composição em briefing.service.ts).
// Só o servidor consulta (TTL 5 min, timeout 3 s, C.5); o app nunca chama a página.
//
// Cache: uma página serve todas as linhas, então a `cacheKey` é fixa e o valor guardado traz TODAS as
// linhas cobertas. O recorte pelas linhas vinculadas ao trajeto é feito depois do runner, em
// `observarLinhasMetroSp` / `filtrarLinhas`; filtrar dentro do `fetch` misturaria trajetos no cache.
import { LINHAS_METRO_RF21, type RailLine, type RailValue } from '@kairos/contracts';
import { SchemaValidationError } from '../../infrastructure/errors.js';
import { createHttpClient, type HttpClient } from '../../infrastructure/http-client.js';
import type { DimensionProvider, ObservationOf, ProviderFetchContext, ProviderResult } from '../../infrastructure/provider.js';
import type { ProviderRunner, RunOptions } from '../../infrastructure/provider-runner.js';
import { parseDiretoMetro } from './metro-sp.parser.js';

export const METRO_SP_SOURCE = 'metro-sp';
export const METRO_SP_URL = 'https://www.metro.sp.gov.br/wp-content/themes/metrosp/direto-metro.php?embed=1';
export const METRO_SP_TTL_SECONDS = 5 * 60; // C.5
export const METRO_SP_TIMEOUT_MS = 3_000; // C.5

/** Linhas que a página cobre e que o projeto usa (RF21, decisão de 10/10/2026). */
export const LINHAS_METRO_SP = LINHAS_METRO_RF21;

const COBERTAS: ReadonlySet<RailLine> = new Set(LINHAS_METRO_SP);

export interface MetroSpAdapterOptions {
  /** Injetável para testes; padrão: http-client com o User-Agent do projeto. */
  http?: HttpClient;
}

/** Separa as linhas vinculadas entre as que esta página cobre e as que ficam sem fonte. */
export function separarCobertura(vinculadas: readonly RailLine[]): { cobertas: RailLine[]; semFonte: RailLine[] } {
  const unicas = [...new Set(vinculadas)];
  return {
    cobertas: unicas.filter((l) => COBERTAS.has(l)),
    semFonte: unicas.filter((l) => !COBERTAS.has(l)),
  };
}

/** Mantém no valor só as linhas vinculadas (na ordem da página). */
export function filtrarLinhas(value: RailValue, vinculadas: readonly RailLine[]): RailValue {
  const pedidas = new Set(vinculadas);
  return { linhas: value.linhas.filter((l) => pedidas.has(l.linha)) };
}

export function createMetroSpAdapter(options: MetroSpAdapterOptions = {}): DimensionProvider<RailLine[], 'rail'> {
  const http = options.http ?? createHttpClient();

  return {
    source: METRO_SP_SOURCE,
    dimension: 'rail',
    ttlSeconds: METRO_SP_TTL_SECONDS,
    timeoutMs: METRO_SP_TIMEOUT_MS,
    refreshAhead: true,
    // Uma página serve todas as linhas: a chave não depende da entrada
    cacheKey: () => 'direto-metro',

    async fetch(_vinculadas: RailLine[], ctx: ProviderFetchContext): Promise<ProviderResult<RailValue>> {
      const { text } = await http.requestText(METRO_SP_URL, {
        signal: ctx.signal,
        timeoutMs: ctx.timeoutMs ?? METRO_SP_TIMEOUT_MS,
        headers: { Accept: 'text/html' },
      });
      const linhas = parseDiretoMetro(text).filter((l) => COBERTAS.has(l.linha));

      // Uma linha coberta sumida da página não pode virar "tudo normal": a dimensão fica indisponível
      const presentes = new Set(linhas.map((l) => l.linha));
      const faltando = LINHAS_METRO_SP.filter((l) => !presentes.has(l));
      if (faltando.length > 0) {
        throw new SchemaValidationError(
          [{ path: 'direto-metro', message: `linhas ausentes na página: ${faltando.join(', ')}` }],
          [...presentes].join(', ') || '(nenhuma)',
        );
      }

      // observedAt = hora desta leitura (o runner usa o instante da busca). O "atualizado em" da página é a
      // hora da última MUDANÇA de status (horas atrás numa linha normal) e deixava os trilhos `stale` à toa
      // (T19, 13/10/2026; mesma regra da ARTESP). Ele fica só no parser, como informação.
      // `detalhe`: a descrição do popover só quando a linha não está normal ("Situação Normal" não explica nada).
      return {
        value: {
          linhas: linhas.map(({ linha, statusTexto, situacao, descricao }) => ({
            linha,
            statusTexto,
            situacao,
            detalhe: situacao === 'NORMAL' ? null : descricao || null,
            fonte: METRO_SP_SOURCE,
          })),
        },
      };
    },
  };
}

/** Executa o provedor pelo runner e recorta o valor para as linhas vinculadas ao trajeto. */
export async function observarLinhasMetroSp(
  runner: ProviderRunner,
  provider: DimensionProvider<RailLine[], 'rail'>,
  vinculadas: readonly RailLine[],
  opts: RunOptions,
): Promise<ObservationOf<'rail'>> {
  const { cobertas } = separarCobertura(vinculadas);
  const observation = await runner.observe(provider, cobertas, opts);
  if (observation.value === null) return observation;
  return { ...observation, value: filtrarLinhas(observation.value, cobertas) };
}
