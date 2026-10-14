import { ProblemDetailsSchema, type ProblemDetails } from '@kairos/contracts';

export type TipoErroApi = 'http' | 'rede' | 'tempo-esgotado' | 'contrato';

/**
 * Erro do cliente de API com mensagem pronta para o usuário (pt-BR, C.5).
 * Para 4xx/5xx a mensagem vem do `title` do Problem Details (RFC 9457).
 */
export class ApiError extends Error {
  readonly tipo: TipoErroApi;
  readonly status: number | null;
  readonly problema: ProblemDetails | null;

  constructor(
    tipo: TipoErroApi,
    mensagem: string,
    status: number | null = null,
    problema: ProblemDetails | null = null
  ) {
    super(mensagem);
    this.name = 'ApiError';
    this.tipo = tipo;
    this.status = status;
    this.problema = problema;
  }

  /** Erros 4xx e de contrato não mudam se repetirmos a chamada. */
  get valeRepetir(): boolean {
    if (this.tipo === 'contrato') return false;
    if (this.tipo === 'http' && this.status !== null && this.status < 500) return false;
    return true;
  }
}

/** Monta o ApiError de uma resposta HTTP não-2xx. */
export async function erroDeResposta(res: Response): Promise<ApiError> {
  let corpo: unknown = null;
  try {
    corpo = await res.json();
  } catch {
    // corpo vazio ou não-JSON (ex.: proxy devolvendo HTML)
  }
  const problema = ProblemDetailsSchema.safeParse(corpo);
  if (problema.success) {
    return new ApiError('http', problema.data.title, res.status, problema.data);
  }
  const generica =
    res.status >= 500
      ? `O servidor do Καιρός falhou (HTTP ${res.status}). Tente de novo em instantes.`
      : `O servidor do Καιρός recusou o pedido (HTTP ${res.status}).`;
  return new ApiError('http', generica, res.status);
}

/** Mensagem pt-BR para qualquer erro vindo de uma query/mutation. */
export function mensagemDeErro(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return `Falha inesperada no app: ${err.message}`;
  return 'Falha inesperada no app.';
}
