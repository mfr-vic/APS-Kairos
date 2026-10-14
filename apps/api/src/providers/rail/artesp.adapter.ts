// Adaptador da API Trilhos da ARTESP (T19, RF09): linhas 4 (ViaQuatro), 5 (ViaMobilidade 5), 6 (Linha Uni),
// 7 (TIC Trens), 8 e 9 (ViaMobilidade 8 e 9). Spike T05 (13/10/2026) em spikes/artesp/.
// Só o servidor consulta; a chave (ARTESP_KEY) fica no .env do backend e nunca vai para log, erro ou resposta.
//
// Orçamento: a credencial aceita 12 req/h (X-RateLimit-*); o limitador próprio deixa ≤ 10/h (C.5) e, depois
// de um 429, bloqueia até o `Retry-After` sem chamar a fonte (o runner serve o cache vencido como `stale`).
// TTL 6 min → no máximo 10 chamadas/h por briefings; por isso este provedor NÃO entra na renovação
// antecipada a 80 % do TTL (seriam 60/4,8 = 12,5 chamadas/h, acima do teto).
//
// Cache: `GET /status/` traz todas as linhas numa chamada, então a `cacheKey` é fixa e o recorte pelas linhas
// do trajeto é feito depois do runner (como em metro-sp.adapter.ts).
import { LINHAS_ARTESP, RailLineSchema, type RailLine, type RailSituation, type RailValue } from '@kairos/contracts';
import { z } from 'zod';
import { systemClock, type Clock } from '../../infrastructure/clock.js';
import { HttpStatusError, RateLimitedError, SchemaValidationError } from '../../infrastructure/errors.js';
import { createHttpClient, type HttpClient } from '../../infrastructure/http-client.js';
import type { DimensionProvider, ProviderFetchContext, ProviderResult } from '../../infrastructure/provider.js';
import { RATE_LIMITS, SlidingWindowLimiter, type RateLimiter } from '../../infrastructure/rate-limiter.js';
import { normalizarSituacao } from './metro-sp.parser.js';

export const ARTESP_SOURCE = 'artesp';
export const ARTESP_STATUS_URL = 'https://ccm.artesp.sp.gov.br/metroferroviario/api/status/';
export const ARTESP_TTL_SECONDS = 6 * 60; // C.5
export const ARTESP_TIMEOUT_MS = 3_000; // C.5
/** Sem `Retry-After` legível num 429: espera conservadora. */
export const ARTESP_RETRY_AFTER_PADRAO_S = 10 * 60;
/**
 * Intervalo entre retratos da ARTESP: a doc pede consulta no máximo a cada 5 min, e o `meta.timestamp` chegou
 * 193 s atrás da resposta em 13/10/2026 (a fonte serve um retrato em cache). O status vale até o próximo retrato.
 */
export const ARTESP_INTERVALO_RETRATO_S = 5 * 60;

const COBERTAS: ReadonlySet<RailLine> = new Set(LINHAS_ARTESP);

// Só os campos usados; o resto da resposta (estações, ids…) é ignorado
const ArtespStatusSchema = z.object({
  meta: z.object({ timestamp: z.string() }),
  empresas: z
    .object({
      nome: z.string(),
      linhas: z
        .object({
          codigo: z.string(),
          status: z.object({
            situacao: z.string().min(1),
            descricao: z.string().nullish(),
            classificacao: z.string().nullish(),
            operacao_normal: z.boolean(),
            /** Hora da última MUDANÇA de status (não da confirmação): só informativa. */
            atualizado_em: z.string().nullish(),
          }),
        })
        .array(),
    })
    .array(),
});
export type ArtespStatus = z.infer<typeof ArtespStatusSchema>;

/** "2026-10-13T15:04:40.914266" (hora local de SP, sem fuso) → "2026-10-13T15:04:40.914-03:00"; com fuso, mantém. */
export function artespParaIso(dataHora: string): string | null {
  // Mantém os milissegundos: truncar para o segundo envelheceria o dado em até 1 s (stale na borda do TTL)
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d{1,3})?\d*(Z|[+-]\d{2}:\d{2})?$/.exec(dataHora.trim());
  if (!m) return null;
  const iso = `${m[1]}${m[2] ?? ''}${m[3] ?? '-03:00'}`; // SP sem horário de verão desde 2019
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/**
 * RN06 (B.8) sobre o status da ARTESP: "encerrad"/"paralisad" → PARALISADA SEMPRE, mesmo com
 * `classificacao: "ignorar"` (decisão do usuário de 10/10/2026: linha fechada não pode ser usada; a linha 6
 * aparece "Operação Encerrada" + "ignorar" no spike de 13/10). `operacao_normal: true` → NORMAL; demais → ALTERADA.
 */
export function situacaoArtesp(situacao: string, operacaoNormal: boolean): RailSituation {
  const s = normalizarSituacao(situacao);
  return s === 'ALTERADA' && operacaoNormal ? 'NORMAL' : s;
}

/** Instante em ms → ISO no horário de SP com milissegundos ("…T15:09:40.914-03:00"). */
function isoSaoPaulo(ms: number): string {
  return `${new Date(ms - 3 * 3_600_000).toISOString().slice(0, 23)}-03:00`;
}

/**
 * JSON do `/status/` → valor do contrato com as linhas 4–9.
 * `observedAt` = fim do retrato (`meta.timestamp` + 5 min), limitado a `agoraMs` — mesma regra da opção B
 * da Open-Meteo (C.5, decisão do usuário de 13/10/2026): o retrato descreve o status até o próximo, e sem isso
 * a ARTESP ficava `stale` nos minutos finais de cada ciclo de 6 min de cache.
 */
export function mapearStatusArtesp(dados: ArtespStatus, agoraMs: number): ProviderResult<RailValue> {
  const retrato = artespParaIso(dados.meta.timestamp);
  if (!retrato) {
    throw new SchemaValidationError([{ path: 'meta.timestamp', message: 'data/hora inválida' }], dados.meta.timestamp);
  }
  const observedAt = isoSaoPaulo(Math.min(Date.parse(retrato) + ARTESP_INTERVALO_RETRATO_S * 1000, agoraMs));
  const linhas: RailValue['linhas'] = [];
  for (const empresa of dados.empresas) {
    for (const l of empresa.linhas) {
      const linha = RailLineSchema.safeParse(`L${l.codigo.trim()}`);
      if (!linha.success || !COBERTAS.has(linha.data)) continue;
      linhas.push({
        linha: linha.data,
        statusTexto: l.status.situacao,
        situacao: situacaoArtesp(l.status.situacao, l.status.operacao_normal),
        detalhe: l.status.descricao?.trim() || null,
        fonte: ARTESP_SOURCE,
      });
    }
  }
  // Uma linha sumida da resposta não pode virar "tudo normal": a dimensão fica indisponível
  const faltando = LINHAS_ARTESP.filter((l) => !linhas.some((x) => x.linha === l));
  if (faltando.length > 0) {
    throw new SchemaValidationError(
      [{ path: 'empresas', message: `linhas ausentes na resposta: ${faltando.join(', ')}` }],
      linhas.map((l) => l.linha).join(', ') || '(nenhuma)',
    );
  }
  linhas.sort((a, b) => Number(a.linha.slice(1)) - Number(b.linha.slice(1)));
  // Base é o meta.timestamp (retrato da ARTESP), nunca `atualizado_em` (última mudança, horas atrás numa linha
  // normal): com ele toda linha normal nasceria `stale`.
  return { value: { linhas }, observedAt };
}

/** ≤ 10 req/h (janela deslizante) + bloqueio até o `Retry-After` de um 429. */
export class LimiteArtesp implements RateLimiter {
  private bloqueadoAte = 0;
  private readonly janela: SlidingWindowLimiter;

  constructor(private readonly clock: Clock = systemClock) {
    this.janela = new SlidingWindowLimiter({ ...RATE_LIMITS.artesp, clock });
  }

  bloquearAte(ms: number): void {
    this.bloqueadoAte = Math.max(this.bloqueadoAte, ms);
  }

  async acquire(signal?: AbortSignal): Promise<void> {
    if (this.clock.now() < this.bloqueadoAte) throw new RateLimitedError(this.bloqueadoAte);
    await this.janela.acquire(signal);
  }
}

/** `Retry-After` em segundos ou data HTTP → ms de espera. */
function esperaRetryAfter(valor: string | null | undefined, agora: number): number {
  if (valor) {
    const s = Number(valor);
    if (Number.isFinite(s) && s >= 0) return s * 1000;
    const data = Date.parse(valor);
    if (!Number.isNaN(data)) return Math.max(0, data - agora);
  }
  return ARTESP_RETRY_AFTER_PADRAO_S * 1000;
}

export interface ArtespAdapterOptions {
  /** ARTESP_KEY (obrigatória: sem chave o provedor não é criado). */
  chave: string;
  http?: HttpClient;
  clock?: Clock;
}

export type ArtespAdapter = DimensionProvider<RailLine[], 'rail'> & {
  /** Registrar no runner como `rateLimiters[ARTESP_SOURCE]`. */
  readonly limiter: LimiteArtesp;
};

export function createArtespAdapter(options: ArtespAdapterOptions): ArtespAdapter {
  const http = options.http ?? createHttpClient();
  const clock = options.clock ?? systemClock;
  const limiter = new LimiteArtesp(clock);
  const headers = { Authorization: `Api-Key ${options.chave}` };

  return {
    source: ARTESP_SOURCE,
    dimension: 'rail',
    ttlSeconds: ARTESP_TTL_SECONDS,
    timeoutMs: ARTESP_TIMEOUT_MS,
    limiter,
    cacheKey: () => 'status',

    async fetch(_vinculadas: RailLine[], ctx: ProviderFetchContext): Promise<ProviderResult<RailValue>> {
      try {
        const dados = await http.requestJson(ARTESP_STATUS_URL, ArtespStatusSchema, {
          signal: ctx.signal,
          timeoutMs: ctx.timeoutMs ?? ARTESP_TIMEOUT_MS,
          headers,
        });
        return mapearStatusArtesp(dados, clock.now());
      } catch (err) {
        if (!(err instanceof HttpStatusError)) throw err;
        if (err.status === 429) {
          const ate = clock.now() + esperaRetryAfter(err.extra.retryAfter, clock.now());
          limiter.bloquearAte(ate);
          throw new RateLimitedError(ate);
        }
        const motivo =
          err.status === 401
            ? 'ARTESP recusou a chave (HTTP 401)'
            : err.status === 403
              ? 'ARTESP: IP não autorizado ou termos de uso pendentes (HTTP 403)'
              : undefined;
        if (motivo) throw new HttpStatusError(err.status, err.url, err.trecho, { motivo });
        throw err;
      }
    },
  };
}
