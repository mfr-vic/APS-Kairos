// Cliente com sessão do SPTrans Olho Vivo v2.1 (T18, RF02, RF08, C.5: "sessão renovada se receber 401").
// Login por POST /Login/Autenticar?token= → cookie apiCredentials, guardado só em memória.
// O token nunca é logado nem vai para mensagens de erro (a URL do login aparece como token=***).
import type { ZodType, ZodTypeDef } from 'zod';
import { HttpStatusError, ProviderError, ProviderNetworkError } from '../../infrastructure/errors.js';
import { createHttpClient, truncar, type HttpClient } from '../../infrastructure/http-client.js';

export const OLHO_VIVO_BASE_URL = 'https://api.olhovivo.sptrans.com.br/v2.1';
/** Identificador da fonte no envelope, nos logs e no circuit breaker. */
export const OLHO_VIVO_SOURCE = 'sptrans-olhovivo';

/** Login recusado ou com falha HTTP. É um HttpStatusError para o `motivo` sair "HTTP <status>". */
export class OlhoVivoLoginError extends HttpStatusError {
  constructor(status: number, url: string, trecho: string, mensagem: string) {
    super(status, url, trecho);
    this.name = 'OlhoVivoLoginError';
    this.message = mensagem;
  }
}

export interface OlhoVivoClientOptions {
  /** SPTRANS_TOKEN (só do .env do backend). */
  token: string | undefined;
  http?: HttpClient;
  baseUrl?: string;
}

export interface OlhoVivoGetOptions {
  signal?: AbortSignal;
}

export class OlhoVivoClient {
  private readonly token: string;
  private readonly http: HttpClient;
  private readonly baseUrl: string;
  /** Valor do cabeçalho Cookie da sessão atual (ex.: "apiCredentials=…"). */
  private cookie: string | null = null;
  /** Login em andamento: chamadas concorrentes esperam o mesmo login. */
  private loginEmAndamento: Promise<string> | null = null;

  constructor(options: OlhoVivoClientOptions) {
    this.token = options.token?.trim() ?? '';
    this.http = options.http ?? createHttpClient();
    this.baseUrl = (options.baseUrl ?? OLHO_VIVO_BASE_URL).replace(/\/$/, '');
  }

  /**
   * GET autenticado com validação Zod. Faz login sob demanda; se a fonte responder 401,
   * renova a sessão uma vez e repete a chamada (um segundo 401 é repassado como erro).
   */
  async getJson<T>(path: string, schema: ZodType<T, ZodTypeDef, unknown>, opts: OlhoVivoGetOptions = {}): Promise<T> {
    const url = this.baseUrl + path;
    const cookie = await this.sessao();
    try {
      return await this.http.requestJson(url, schema, { headers: { Cookie: cookie }, signal: opts.signal });
    } catch (err) {
      if (!(err instanceof HttpStatusError && err.status === 401)) throw err;
    }
    const novo = await this.renovar(cookie);
    return this.http.requestJson(url, schema, { headers: { Cookie: novo }, signal: opts.signal });
  }

  private sessao(): Promise<string> {
    return this.cookie ? Promise.resolve(this.cookie) : this.renovar(null);
  }

  /** Refaz o login, a menos que outra chamada já tenha trocado o cookie recusado. */
  private renovar(cookieRecusado: string | null): Promise<string> {
    if (this.cookie && this.cookie !== cookieRecusado) return Promise.resolve(this.cookie);
    if (!this.loginEmAndamento) {
      this.cookie = null;
      this.loginEmAndamento = this.autenticar()
        .then((cookie) => {
          this.cookie = cookie;
          return cookie;
        })
        .finally(() => {
          this.loginEmAndamento = null;
        });
    }
    return this.loginEmAndamento;
  }

  private async autenticar(): Promise<string> {
    const urlLog = `${this.baseUrl}/Login/Autenticar?token=***`;
    if (!this.token) {
      throw new OlhoVivoLoginError(401, urlLog, '', 'SPTRANS_TOKEN não configurado no servidor');
    }
    const url = `${this.baseUrl}/Login/Autenticar?token=${encodeURIComponent(this.token)}`;
    let text: string;
    let response: Response;
    try {
      // Sem o signal de quem chamou: o login é compartilhado; vale o timeout padrão do http-client (3 s)
      ({ text, response } = await this.http.requestText(url, { method: 'POST' }));
    } catch (err) {
      throw this.semToken(err, urlLog);
    }
    if (text.trim() !== 'true') {
      throw new OlhoVivoLoginError(401, urlLog, this.limpar(truncar(text)), 'login recusado pelo Olho Vivo');
    }
    const cookies = response.headers
      .getSetCookie()
      .map((c) => c.split(';')[0]!.trim())
      .filter((c) => c.includes('='));
    if (cookies.length === 0) {
      throw new OlhoVivoLoginError(401, urlLog, '', 'login sem cookie de sessão');
    }
    return cookies.join('; ');
  }

  /** Converte o erro do login num equivalente sem o token (e sem `cause`, que poderia carregar a URL). */
  private semToken(err: unknown, urlLog: string): ProviderError {
    if (err instanceof HttpStatusError) {
      return new OlhoVivoLoginError(err.status, urlLog, this.limpar(err.trecho), `login falhou: HTTP ${err.status}`);
    }
    if (err instanceof ProviderError && err.kind !== 'network') return err; // timeout/aborted: sem URL
    const mensagem = err instanceof Error ? err.message : String(err);
    return new ProviderNetworkError(this.limpar(mensagem));
  }

  private limpar(texto: string): string {
    if (!this.token) return texto;
    return texto.split(this.token).join('***').split(encodeURIComponent(this.token)).join('***');
  }
}
