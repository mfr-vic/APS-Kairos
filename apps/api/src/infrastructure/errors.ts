// Erros tipados dos provedores (T16, RF15). O `kind` vai para o log estruturado (RNF09).

export type ProviderErrorKind =
  | 'timeout'
  | 'aborted'
  | 'network'
  | 'http-status'
  | 'invalid-json'
  | 'schema'
  | 'circuit-open'
  | 'rate-limited';

export abstract class ProviderError extends Error {
  abstract readonly kind: ProviderErrorKind;
  /** Se conta como falha do provedor no circuit breaker. */
  abstract readonly countsAsFailure: boolean;
}

/** A fonte não respondeu dentro do timeout do provedor (C.5: 3 s). */
export class ProviderTimeoutError extends ProviderError {
  readonly kind = 'timeout';
  readonly countsAsFailure = true;
  constructor(readonly timeoutMs: number) {
    super(`sem resposta em ${timeoutMs} ms`);
    this.name = 'ProviderTimeoutError';
  }
}

/** Cancelado por quem chamou (ex.: prazo global de 4 s do briefing). Não é culpa da fonte. */
export class ProviderAbortedError extends ProviderError {
  readonly kind = 'aborted';
  readonly countsAsFailure = false;
  constructor(message = 'chamada cancelada antes da resposta') {
    super(message);
    this.name = 'ProviderAbortedError';
  }
}

/** Falha de rede (DNS, conexão recusada, TLS…). */
export class ProviderNetworkError extends ProviderError {
  readonly kind = 'network';
  readonly countsAsFailure = true;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ProviderNetworkError';
  }
}

/** A fonte respondeu com status fora de 2xx. */
export class HttpStatusError extends ProviderError {
  readonly kind = 'http-status';
  readonly countsAsFailure = true;
  constructor(
    readonly status: number,
    readonly url: string,
    /** Início do corpo da resposta, para log. */
    readonly trecho: string,
    readonly extra: {
      /** Cabeçalho `Retry-After` cru (429/503), se veio. */
      retryAfter?: string | null;
      /** Motivo humano específico da fonte (ex.: chave recusada), no lugar do genérico. */
      motivo?: string;
    } = {},
  ) {
    super(`HTTP ${status}`);
    this.name = 'HttpStatusError';
  }
}

/** O corpo não é JSON válido (TC14: JSON malformado). */
export class InvalidJsonError extends ProviderError {
  readonly kind = 'invalid-json';
  readonly countsAsFailure = true;
  constructor(readonly trecho: string) {
    super('resposta não é JSON válido');
    this.name = 'InvalidJsonError';
  }
}

export interface SchemaIssueResumo {
  path: string;
  message: string;
}

/** O JSON não segue o schema esperado (C.5: conta como falha; TC14: log com o trecho inválido). */
export class SchemaValidationError extends ProviderError {
  readonly kind = 'schema';
  readonly countsAsFailure = true;
  constructor(
    readonly issues: SchemaIssueResumo[],
    /** Valor encontrado no caminho do primeiro problema, serializado e truncado. */
    readonly trecho: string,
  ) {
    super(`resposta fora do formato esperado: ${issues.map((i) => `${i.path || '(raiz)'}: ${i.message}`).join('; ')}`);
    this.name = 'SchemaValidationError';
  }
}

/** Circuit breaker aberto: a chamada nem foi feita (C.5). */
export class CircuitOpenError extends ProviderError {
  readonly kind = 'circuit-open';
  readonly countsAsFailure = false;
  constructor(readonly retryAt: number) {
    super('circuit breaker aberto');
    this.name = 'CircuitOpenError';
  }
}

/** Limite de taxa atingido: a chamada nem foi feita (RNF03). */
export class RateLimitedError extends ProviderError {
  readonly kind = 'rate-limited';
  readonly countsAsFailure = false;
  constructor(readonly retryAt: number) {
    super('limite de requisições da fonte atingido');
    this.name = 'RateLimitedError';
  }
}

/** Converte qualquer erro em ProviderError (erros desconhecidos do adaptador viram falha de rede). */
export function toProviderError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new ProviderNetworkError(message, { cause: err });
}

/** Mensagem curta em pt-BR para o campo `motivo` do envelope. */
export function motivoDoErro(err: ProviderError): string {
  switch (err.kind) {
    case 'timeout':
      return 'A fonte não respondeu a tempo';
    case 'aborted':
      return 'Prazo do briefing esgotado antes da resposta da fonte';
    case 'network':
      return 'Falha de conexão com a fonte';
    case 'http-status':
      return (err as HttpStatusError).extra.motivo ?? `A fonte respondeu com erro (HTTP ${(err as HttpStatusError).status})`;
    case 'invalid-json':
    case 'schema':
      return 'A fonte respondeu em formato inesperado';
    case 'circuit-open':
      return 'Fonte com falhas repetidas; nova tentativa em instantes';
    case 'rate-limited':
      return 'Limite de consultas à fonte atingido';
  }
}
