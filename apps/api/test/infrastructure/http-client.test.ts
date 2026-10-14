import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  HttpStatusError,
  InvalidJsonError,
  ProviderAbortedError,
  ProviderTimeoutError,
  SchemaValidationError,
} from '../../src/infrastructure/errors.js';
import { KAIROS_USER_AGENT, createHttpClient, type FetchFn } from '../../src/infrastructure/http-client.js';
import { hangingFetch, jsonResponse } from './helpers.js';

const Schema = z.object({ current: z.object({ temperature_2m: z.number() }) });

describe('http-client (T16, RF15)', () => {
  it('envia o User-Agent do projeto e devolve o corpo validado', async () => {
    const fetch = vi.fn<FetchFn>(async () => jsonResponse({ current: { temperature_2m: 21.5 } }));
    const client = createHttpClient({ fetch });
    const data = await client.requestJson('https://exemplo.test/v1', Schema);
    expect(data.current.temperature_2m).toBe(21.5);
    const init = fetch.mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(KAIROS_USER_AGENT);
    expect(KAIROS_USER_AGENT).toBe('Kairos-APS/0.1 (projeto academico; contato: mfr.vic@gmail.com)');
  });

  it('requestBytes devolve o corpo binário intacto (tiles PNG); requestText decodifica UTF-8', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe]);
    const client = createHttpClient({ fetch: async () => new Response(bytes, { status: 200 }) });
    expect((await client.requestBytes('https://exemplo.test/t.png')).bytes.equals(bytes)).toBe(true);
    const texto = createHttpClient({ fetch: async () => new Response('Operação São Paulo', { status: 200 }) });
    expect((await texto.requestText('https://exemplo.test/x')).text).toBe('Operação São Paulo');
  });

  it('lança ProviderTimeoutError quando a fonte não responde no prazo', async () => {
    const client = createHttpClient({ fetch: hangingFetch(), defaultTimeoutMs: 20 });
    const err = await client.requestJson('https://exemplo.test/lento', Schema).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderTimeoutError);
    expect((err as ProviderTimeoutError).timeoutMs).toBe(20);
  });

  it('distingue cancelamento externo (prazo global) de timeout', async () => {
    const client = createHttpClient({ fetch: hangingFetch(), defaultTimeoutMs: 5_000 });
    const controller = new AbortController();
    const promise = client.requestJson('https://exemplo.test/lento', Schema, { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toBeInstanceOf(ProviderAbortedError);
  });

  it('lança HttpStatusError com status e trecho do corpo', async () => {
    const client = createHttpClient({
      fetch: async () => jsonResponse({ Message: 'Authorization has been denied for this request.' }, 401),
    });
    const err = await client.requestJson('https://exemplo.test/Previsao', Schema).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpStatusError);
    expect((err as HttpStatusError).status).toBe(401);
    expect((err as HttpStatusError).trecho).toContain('Authorization');
  });

  it('lança InvalidJsonError para JSON malformado (TC14)', async () => {
    const client = createHttpClient({ fetch: async () => jsonResponse('{"current": {') });
    await expect(client.requestJson('https://exemplo.test/x', Schema)).rejects.toBeInstanceOf(InvalidJsonError);
  });

  it('lança SchemaValidationError com caminho e trecho do problema (TC14)', async () => {
    const client = createHttpClient({ fetch: async () => jsonResponse({ current: { temperature_2m: 'quente' } }) });
    const err = await client.requestJson('https://exemplo.test/x', Schema).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SchemaValidationError);
    const schemaErr = err as SchemaValidationError;
    expect(schemaErr.issues[0]!.path).toBe('current.temperature_2m');
    expect(schemaErr.trecho).toBe('"quente"');
    expect(schemaErr.countsAsFailure).toBe(true);
  });
});
