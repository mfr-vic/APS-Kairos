// Cliente HTTP dos provedores (T16, RF15): fetch nativo + timeout (AbortController) + validação Zod
import type { ZodType, ZodTypeDef } from 'zod';
import {
  HttpStatusError,
  InvalidJsonError,
  ProviderAbortedError,
  ProviderNetworkError,
  ProviderTimeoutError,
  SchemaValidationError,
} from './errors.js';

export const KAIROS_USER_AGENT = 'Kairos-APS/0.1 (projeto academico; contato: mfr.vic@gmail.com)';
export const DEFAULT_TIMEOUT_MS = 3_000; // C.5
const TRECHO_MAX = 300;

/** Opções do fetch nativo (evita depender do tipo global RequestInit da lib DOM). */
export type FetchInit = NonNullable<Parameters<typeof globalThis.fetch>[1]>;
export type FetchFn = (input: string | URL, init?: FetchInit) => Promise<Response>;

export interface HttpClientOptions {
  /** Injetável para testes; padrão: fetch nativo do Node. */
  fetch?: FetchFn;
  userAgent?: string;
  defaultTimeoutMs?: number;
}

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Timeout desta chamada (padrão 3 s). Cobre a conexão e a leitura do corpo. */
  timeoutMs?: number;
  /** Sinal externo (ex.: prazo global do briefing). */
  signal?: AbortSignal;
}

export interface HttpClient {
  /** Requisição com timeout; lança HttpStatusError fora de 2xx. Devolve o corpo como texto e a Response. */
  requestText(url: string | URL, opts?: RequestOptions): Promise<{ text: string; response: Response }>;
  /** Como requestText, mas devolve o corpo binário (ex.: tiles PNG). */
  requestBytes(url: string | URL, opts?: RequestOptions): Promise<{ bytes: Buffer; response: Response }>;
  /** Requisição + JSON.parse + validação pelo schema; devolve o valor já validado. */
  requestJson<T>(url: string | URL, schema: ZodType<T, ZodTypeDef, unknown>, opts?: RequestOptions): Promise<T>;
}

export function truncar(texto: string, max = TRECHO_MAX): string {
  return texto.length > max ? `${texto.slice(0, max)}…` : texto;
}

/** Valida `data` com o schema; em erro, lança SchemaValidationError com o trecho problemático. */
export function parseWithSchema<T>(schema: ZodType<T, ZodTypeDef, unknown>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const issues = result.error.issues.slice(0, 5).map((i) => ({ path: i.path.join('.'), message: i.message }));
  const first = result.error.issues[0];
  let valor: unknown = data;
  for (const segment of first?.path ?? []) {
    if (valor === null || typeof valor !== 'object') break;
    valor = (valor as Record<string | number, unknown>)[segment];
  }
  let trecho: string;
  try {
    trecho = truncar(JSON.stringify(valor) ?? 'undefined');
  } catch {
    trecho = '(não serializável)';
  }
  throw new SchemaValidationError(issues, trecho);
}

export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const fetchFn: FetchFn = options.fetch ?? ((input, init) => fetch(input, init));
  const userAgent = options.userAgent ?? KAIROS_USER_AGENT;
  const defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function requestText(url: string | URL, opts: RequestOptions = {}) {
    const { bytes, response } = await requestBytes(url, opts);
    return { text: bytes.toString('utf8'), response };
  }

  async function requestBytes(url: string | URL, opts: RequestOptions = {}) {
    const timeoutMs = opts.timeoutMs ?? defaultTimeoutMs;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onExternalAbort = () => controller.abort();
    if (opts.signal?.aborted) controller.abort();
    opts.signal?.addEventListener('abort', onExternalAbort, { once: true });

    const mapAbort = (err: unknown) => {
      if (timedOut) return new ProviderTimeoutError(timeoutMs);
      if (opts.signal?.aborted) return new ProviderAbortedError();
      const message = err instanceof Error ? err.message : String(err);
      return new ProviderNetworkError(message, { cause: err });
    };

    try {
      let response: Response;
      try {
        response = await fetchFn(url, {
          method: opts.method ?? 'GET',
          headers: { 'User-Agent': userAgent, Accept: 'application/json', ...opts.headers },
          body: opts.body,
          signal: controller.signal,
        });
      } catch (err) {
        throw mapAbort(err);
      }
      let bytes: Buffer;
      try {
        bytes = Buffer.from(await response.arrayBuffer());
      } catch (err) {
        throw mapAbort(err);
      }
      // Corpo lido, mas o timer pode ter disparado no meio: respeita o prazo
      if (timedOut) throw new ProviderTimeoutError(timeoutMs);
      if (!response.ok) {
        throw new HttpStatusError(response.status, String(url), truncar(bytes.toString('utf8')), {
          retryAfter: response.headers.get('retry-after'),
        });
      }
      return { bytes, response };
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onExternalAbort);
    }
  }

  async function requestJson<T>(url: string | URL, schema: ZodType<T, ZodTypeDef, unknown>, opts: RequestOptions = {}) {
    const { text } = await requestText(url, opts);
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new InvalidJsonError(truncar(text));
    }
    return parseWithSchema(schema, data);
  }

  return { requestText, requestBytes, requestJson };
}
