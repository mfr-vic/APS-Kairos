// Olho Vivo falso para os testes da T18: login com cookie, 401 sem sessão válida e respostas
// das fixtures reais do spike T04 (copiadas em ./fixtures). Nenhum teste chama a rede.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FetchFn } from '../../../src/infrastructure/http-client.js';
import { createHttpClient } from '../../../src/infrastructure/http-client.js';
import { OlhoVivoClient } from '../../../src/providers/transit/olhovivo.client.js';
import { jsonResponse } from '../../infrastructure/helpers.js';

export const TOKEN_TESTE = 'token-secreto-de-teste-0123456789';

export function fixture<T = unknown>(nome: string): T {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${nome}`, import.meta.url)), 'utf8')) as T;
}

export interface ChamadaFalsa {
  method: string;
  path: string;
  url: string;
  cookie: string | undefined;
}

type Handler = (url: URL) => Response | Promise<Response>;

export function fakeOlhoVivo() {
  const chamadas: ChamadaFalsa[] = [];
  let logins = 0;
  let cookieValido: string | null = null;
  const handlers = new Map<string, Handler>([
    ['/Linha/Buscar', () => jsonResponse(fixture('fixture-linhas.json'))],
    ['/Parada/BuscarParadasPorLinha', () => jsonResponse(fixture('fixture-paradas.json'))],
    ['/Previsao/Parada', () => jsonResponse(fixture('fixture-previsao-parada.json'))],
  ]);
  /** Resposta do login; por padrão aceita só TOKEN_TESTE, como a API real ("true"/"false"). */
  let login: Handler = (url) => {
    if (url.searchParams.get('token') !== TOKEN_TESTE) return jsonResponse(false);
    logins++;
    cookieValido = `apiCredentials=sessao-${logins}`;
    return new Response('true', {
      status: 200,
      headers: { 'content-type': 'application/json', 'set-cookie': `${cookieValido}; path=/; HttpOnly; SameSite=Lax` },
    });
  };

  const fetch: FetchFn = async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/v2\.1/, '');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    chamadas.push({ method: init?.method ?? 'GET', path, url: String(input), cookie: headers.Cookie });
    if (path === '/Login/Autenticar') return login(url);
    if (!cookieValido || headers.Cookie !== cookieValido) {
      return jsonResponse({ Message: 'Authorization has been denied for this request.' }, 401);
    }
    const handler = handlers.get(path);
    return handler ? handler(url) : jsonResponse({ Message: 'not found' }, 404);
  };

  return {
    fetch,
    chamadas,
    get logins() {
      return logins;
    },
    /** Simula a sessão vencida no servidor: o cookie atual passa a receber 401. */
    expirarSessao() {
      cookieValido = 'apiCredentials=expirada';
    },
    responder(path: string, handler: Handler) {
      handlers.set(path, handler);
    },
    responderLogin(handler: Handler) {
      login = handler;
    },
    chamadasA(path: string) {
      return chamadas.filter((c) => c.path === path);
    },
  };
}

export function clienteFalso(fake: ReturnType<typeof fakeOlhoVivo>, token: string | undefined = TOKEN_TESTE) {
  return new OlhoVivoClient({ token, http: createHttpClient({ fetch: fake.fetch }) });
}
