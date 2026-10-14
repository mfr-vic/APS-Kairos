import fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { BusLinesResponseSchema, BusStopsResponseSchema, ProblemDetailsSchema } from '@kairos/contracts';
import { LruCache } from '../../../src/infrastructure/cache/lru-cache.js';
import { ProviderRunner } from '../../../src/infrastructure/provider-runner.js';
import { transitRoutes } from '../../../src/modules/transit/transit.routes.js';
import { FakeClock, jsonResponse } from '../../infrastructure/helpers.js';
import { TOKEN_TESTE, clienteFalso, fakeOlhoVivo } from '../../providers/transit/olhovivo-fake.js';

async function setup() {
  const clock = new FakeClock();
  const runner = new ProviderRunner({ cache: new LruCache({ clock }), clock });
  const fake = fakeOlhoVivo();
  const app = fastify();
  await app.register(transitRoutes, { runner, olhoVivo: clienteFalso(fake) });
  return { app, fake };
}

function esperarProblema(res: { statusCode: number; headers: Record<string, unknown>; json(): unknown }, status: number) {
  expect(res.statusCode).toBe(status);
  expect(String(res.headers['content-type'])).toMatch(/^application\/problem\+json/);
  return ProblemDetailsSchema.parse(res.json());
}

describe('GET /v1/transit/bus/lines (T18, RF02)', () => {
  it('q=875A → 200 com os dois sentidos (TC03)', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: '/v1/transit/bus/lines?q=875A' });

    expect(res.statusCode).toBe(200);
    const body = BusLinesResponseSchema.parse(res.json());
    expect(body.linhas.map((l) => [l.codigoLinha, l.letreiro, l.sentido])).toEqual([
      [609, '875A-10', 1],
      [33377, '875A-10', 2],
    ]);
  });

  it('mesma busca de novo sai do cache (1 chamada à fonte)', async () => {
    const { app, fake } = await setup();
    await app.inject({ method: 'GET', url: '/v1/transit/bus/lines?q=875A' });
    await app.inject({ method: 'GET', url: '/v1/transit/bus/lines?q=875a' });

    expect(fake.chamadasA('/Linha/Buscar')).toHaveLength(1);
  });

  it.each(['/v1/transit/bus/lines', '/v1/transit/bus/lines?q=', '/v1/transit/bus/lines?q=%20%20'])(
    '%s → 400 problem+json',
    async (url) => {
      const { app, fake } = await setup();
      const res = await app.inject({ method: 'GET', url });

      const problema = esperarProblema(res, 400);
      expect(problema).toMatchObject({ title: 'Entrada inválida', code: 'VALIDATION_ERROR', instance: url });
      expect(problema.errors?.[0]?.path).toBe('q');
      expect(fake.chamadas).toHaveLength(0);
    },
  );

  it('fonte com HTTP 500 → 503 problem+json, sem o token na resposta', async () => {
    const { app, fake } = await setup();
    fake.responder('/Linha/Buscar', () => jsonResponse({ Message: 'An error has occurred.' }, 500));

    const res = await app.inject({ method: 'GET', url: '/v1/transit/bus/lines?q=875A' });

    const problema = esperarProblema(res, 503);
    expect(problema).toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      detail: 'A fonte respondeu com erro (HTTP 500)',
      instance: '/v1/transit/bus/lines?q=875A',
    });
    expect(res.body).not.toContain(TOKEN_TESTE);
  });

  it('login recusado → 503 sem o token', async () => {
    const { app, fake } = await setup();
    fake.responderLogin(() => jsonResponse(false));

    const res = await app.inject({ method: 'GET', url: '/v1/transit/bus/lines?q=875A' });

    expect(esperarProblema(res, 503).detail).toBe('A fonte respondeu com erro (HTTP 401)');
    expect(res.body).not.toContain(TOKEN_TESTE);
  });

  it('3 falhas seguidas abrem o circuit breaker → 503 CIRCUIT_BREAKER_OPEN sem chamar a fonte', async () => {
    const { app, fake } = await setup();
    fake.responder('/Linha/Buscar', () => jsonResponse({ Message: 'An error has occurred.' }, 500));
    for (let i = 0; i < 3; i++) await app.inject({ method: 'GET', url: `/v1/transit/bus/lines?q=x${i}` });
    const antes = fake.chamadas.length;

    const res = await app.inject({ method: 'GET', url: '/v1/transit/bus/lines?q=875A' });

    expect(esperarProblema(res, 503).code).toBe('CIRCUIT_BREAKER_OPEN');
    expect(fake.chamadas.length).toBe(antes);
  });
});

describe('GET /v1/transit/bus/stops (T18, RF02)', () => {
  it('lineCode=609 → 200 com as paradas da fixture', async () => {
    const { app, fake } = await setup();
    const res = await app.inject({ method: 'GET', url: '/v1/transit/bus/stops?lineCode=609' });

    expect(res.statusCode).toBe(200);
    const body = BusStopsResponseSchema.parse(res.json());
    expect(body.paradas).toHaveLength(6);
    expect(body.paradas.map((p) => p.codigoParada)).toContain(260016861);
    expect(new URL(fake.chamadasA('/Parada/BuscarParadasPorLinha')[0]!.url).searchParams.get('codigoLinha')).toBe('609');
  });

  it.each(['', '?lineCode=', '?lineCode=abc', '?lineCode=-1', '?lineCode=1.5'])('stops%s → 400 problem+json', async (qs) => {
    const { app, fake } = await setup();
    const res = await app.inject({ method: 'GET', url: `/v1/transit/bus/stops${qs}` });

    const problema = esperarProblema(res, 400);
    expect(problema.code).toBe('VALIDATION_ERROR');
    expect(problema.errors?.[0]?.path).toBe('lineCode');
    expect(fake.chamadas).toHaveLength(0);
  });

  it('resposta fora do formato → 503 problem+json', async () => {
    const { app, fake } = await setup();
    fake.responder('/Parada/BuscarParadasPorLinha', () => jsonResponse([{ cp: 'x' }]));

    const res = await app.inject({ method: 'GET', url: '/v1/transit/bus/stops?lineCode=609' });

    expect(esperarProblema(res, 503).detail).toBe('A fonte respondeu em formato inesperado');
  });
});
