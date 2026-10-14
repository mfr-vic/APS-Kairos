import { describe, expect, it } from 'vitest';
import { LruCache } from '../../../src/infrastructure/cache/lru-cache.js';
import { createHttpClient } from '../../../src/infrastructure/http-client.js';
import { HttpStatusError, ProviderNetworkError } from '../../../src/infrastructure/errors.js';
import { ProviderRunner } from '../../../src/infrastructure/provider-runner.js';
import { OlhoVivoAdapter } from '../../../src/providers/transit/olhovivo.adapter.js';
import { OlhoVivoClient, OlhoVivoLoginError } from '../../../src/providers/transit/olhovivo.client.js';
import { OlhoVivoLinhasSchema } from '../../../src/providers/transit/olhovivo.schemas.js';
import { FakeClock, jsonResponse, memoryLogger } from '../../infrastructure/helpers.js';
import { TOKEN_TESTE, clienteFalso, fakeOlhoVivo } from './olhovivo-fake.js';

/** Tudo o que um erro pode expor em log: mensagem, campos próprios e JSON. */
function textoDoErro(err: unknown): string {
  const e = err as Error & Record<string, unknown>;
  return [e.message, e.stack, JSON.stringify(e), String(e.cause ?? '')].join('\n');
}

describe('OlhoVivoClient (T18): sessão', () => {
  it('faz login sob demanda, envia o cookie apiCredentials e reaproveita a sessão', async () => {
    const fake = fakeOlhoVivo();
    const client = clienteFalso(fake);

    const linhas = await client.getJson('/Linha/Buscar?termosBusca=875A', OlhoVivoLinhasSchema);
    await client.getJson('/Linha/Buscar?termosBusca=875A', OlhoVivoLinhasSchema);

    expect(linhas.map((l) => l.cl)).toEqual([609, 33377]);
    expect(fake.logins).toBe(1);
    const [login] = fake.chamadasA('/Login/Autenticar');
    expect(login!.method).toBe('POST');
    expect(fake.chamadasA('/Linha/Buscar').map((c) => c.cookie)).toEqual([
      'apiCredentials=sessao-1',
      'apiCredentials=sessao-1',
    ]);
  });

  it('C.5: em 401 refaz o login UMA vez e repete a chamada', async () => {
    const fake = fakeOlhoVivo();
    const client = clienteFalso(fake);
    await client.getJson('/Linha/Buscar?termosBusca=875A', OlhoVivoLinhasSchema);

    fake.expirarSessao();
    const linhas = await client.getJson('/Linha/Buscar?termosBusca=875A', OlhoVivoLinhasSchema);

    expect(linhas).toHaveLength(2);
    expect(fake.logins).toBe(2);
    expect(fake.chamadas.map((c) => c.path)).toEqual([
      '/Login/Autenticar',
      '/Linha/Buscar',
      '/Linha/Buscar', // 401
      '/Login/Autenticar',
      '/Linha/Buscar',
    ]);
  });

  it('401 de novo depois do novo login → HttpStatusError 401, sem laço de logins', async () => {
    const fake = fakeOlhoVivo();
    fake.responder('/Linha/Buscar', () => jsonResponse({ Message: 'Authorization has been denied' }, 401));
    const client = clienteFalso(fake);

    const err = await client.getJson('/Linha/Buscar?termosBusca=875A', OlhoVivoLinhasSchema).catch((e) => e);

    expect(err).toBeInstanceOf(HttpStatusError);
    expect((err as HttpStatusError).status).toBe(401);
    expect(fake.logins).toBe(2);
    expect(fake.chamadasA('/Linha/Buscar')).toHaveLength(2);
  });

  it('chamadas concorrentes sem sessão esperam um único login', async () => {
    const fake = fakeOlhoVivo();
    const client = clienteFalso(fake);

    await Promise.all([1, 2, 3].map(() => client.getJson('/Linha/Buscar?termosBusca=875A', OlhoVivoLinhasSchema)));

    expect(fake.logins).toBe(1);
  });

  it('vários 401 simultâneos com o mesmo cookie vencido → um único novo login', async () => {
    const fake = fakeOlhoVivo();
    const client = clienteFalso(fake);
    await client.getJson('/Linha/Buscar?termosBusca=875A', OlhoVivoLinhasSchema);
    fake.expirarSessao();

    await Promise.all([1, 2, 3].map(() => client.getJson('/Linha/Buscar?termosBusca=875A', OlhoVivoLinhasSchema)));

    expect(fake.logins).toBe(2);
  });
});

describe('OlhoVivoClient (T18): o token nunca aparece em erro nem em log', () => {
  it('login recusado ("false") → OlhoVivoLoginError sem o token', async () => {
    const fake = fakeOlhoVivo();
    const client = clienteFalso(fake, 'outro-token-errado-987654');

    const err = await client.getJson('/Linha/Buscar?termosBusca=875A', OlhoVivoLinhasSchema).catch((e) => e);

    expect(err).toBeInstanceOf(OlhoVivoLoginError);
    expect((err as OlhoVivoLoginError).status).toBe(401);
    expect((err as OlhoVivoLoginError).url).toContain('token=***');
    expect(textoDoErro(err)).not.toContain('outro-token-errado-987654');
    expect(fake.chamadasA('/Linha/Buscar')).toHaveLength(0);
  });

  it('login com HTTP 500 cujo corpo ecoa o token → erro sem o token', async () => {
    const fake = fakeOlhoVivo();
    fake.responderLogin((url) => jsonResponse({ Message: `erro em ${url.href}` }, 500));
    const client = clienteFalso(fake);

    const err = await client.getJson('/Linha/Buscar?termosBusca=875A', OlhoVivoLinhasSchema).catch((e) => e);

    expect(err).toBeInstanceOf(HttpStatusError);
    expect((err as HttpStatusError).status).toBe(500);
    expect((err as HttpStatusError).trecho).toContain('token=***');
    expect(textoDoErro(err)).not.toContain(TOKEN_TESTE);
  });

  it('falha de rede no login com a URL na mensagem → ProviderNetworkError sem o token e sem cause', async () => {
    const client = new OlhoVivoClient({
      token: TOKEN_TESTE,
      http: createHttpClient({
        fetch: async (input) => {
          throw new TypeError(`fetch failed: ${String(input)}`);
        },
      }),
    });

    const err = await client.getJson('/Linha/Buscar?termosBusca=875A', OlhoVivoLinhasSchema).catch((e) => e);

    expect(err).toBeInstanceOf(ProviderNetworkError);
    expect((err as Error).cause).toBeUndefined();
    expect(textoDoErro(err)).not.toContain(TOKEN_TESTE);
  });

  it('SPTRANS_TOKEN ausente → erro claro, sem chamar a fonte', async () => {
    const fake = fakeOlhoVivo();
    const client = new OlhoVivoClient({ token: undefined, http: createHttpClient({ fetch: fake.fetch }) });

    const err = await client.getJson('/Linha/Buscar?termosBusca=875A', OlhoVivoLinhasSchema).catch((e) => e);

    expect(err).toBeInstanceOf(OlhoVivoLoginError);
    expect((err as Error).message).toMatch(/SPTRANS_TOKEN/);
    expect(fake.chamadas).toHaveLength(0);
  });

  it('logs do ProviderRunner com login falhando não contêm o token', async () => {
    const fake = fakeOlhoVivo();
    fake.responderLogin((url) => jsonResponse({ Message: `erro em ${url.href}` }, 500));
    const clock = new FakeClock();
    const runner = new ProviderRunner({ cache: new LruCache({ clock }), clock });
    const logger = memoryLogger();

    const obs = await runner.observe(
      new OlhoVivoAdapter(clienteFalso(fake), clock),
      { codigoParada: 260016861, linhas: [{ codigoLinha: 609, letreiro: '875A-10', codigoParada: 260016861 }] },
      { logger },
    );

    expect(obs.status).toBe('unavailable');
    expect(JSON.stringify(logger.lines)).not.toContain(TOKEN_TESTE);
    expect(JSON.stringify(obs)).not.toContain(TOKEN_TESTE);
  });
});
