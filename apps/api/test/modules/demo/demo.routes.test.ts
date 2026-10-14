import { Writable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fastify from 'fastify';
import { ProblemDetailsSchema } from '@kairos/contracts';
import {
  CenarioAtivo,
  NOMES_CENARIO,
  demoRoutes,
  selecionarProvedores,
  type DemoRoutesOptions,
} from '../../../src/modules/demo/index.js';
import { FakeClock } from '../../infrastructure/helpers.js';
import { briefingSimulado, montarDemo } from './helpers.js';

const TOKEN = 'token-de-teste-0123456789';
const URL = '/v1/demo/scenario';

const apps: ReturnType<typeof fastify>[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

async function montarApp(opts: Partial<DemoRoutesOptions> = {}, logs?: string[]) {
  const cenario = opts.cenario ?? new CenarioAtivo(new FakeClock());
  const stream = new Writable({
    write(chunk, _enc, cb) {
      logs?.push(String(chunk));
      cb();
    },
  });
  const app = fastify({ logger: logs ? { level: 'info', stream } : false });
  apps.push(app);
  await app.register(demoRoutes, { demoMode: true, demoToken: TOKEN, ...opts, cenario });
  await app.ready();
  return { app, cenario };
}

function problema(res: { statusCode: number; headers: Record<string, unknown>; json: () => unknown }, status: number) {
  expect(res.statusCode).toBe(status);
  expect(res.headers['content-type']).toContain('application/problem+json');
  const body = ProblemDetailsSchema.parse(res.json());
  expect(body.status).toBe(status);
  return body;
}

describe('POST/GET /v1/demo/scenario (T21, RF19, C.4, C.7)', () => {
  it('TC24: DEMO_MODE=false → 404, mesmo com o token certo, e o cenário não muda', async () => {
    const { app, cenario } = await montarApp({ demoMode: false });
    const headers = { 'x-demo-token': TOKEN };

    const post = await app.inject({ method: 'POST', url: URL, headers, payload: { cenario: 'chuva-forte' } });
    const get = await app.inject({ method: 'GET', url: URL, headers });

    expect(problema(post, 404).code).toBe('NOT_FOUND');
    problema(get, 404);
    expect(cenario.nome).toBe('real');
  });

  it('sem X-Demo-Token → 401 (antes de validar o corpo)', async () => {
    const { app, cenario } = await montarApp();

    const res = await app.inject({ method: 'POST', url: URL, payload: { cenario: 'nao-existe' } });

    expect(problema(res, 401).code).toBe('UNAUTHORIZED');
    problema(await app.inject({ method: 'GET', url: URL }), 401);
    expect(cenario.nome).toBe('real');
  });

  it.each(['errado', `${TOKEN}x`, TOKEN.slice(0, -1), TOKEN.toUpperCase()])('token %s → 403', async (token) => {
    const { app, cenario } = await montarApp();

    const res = await app.inject({
      method: 'POST',
      url: URL,
      headers: { 'x-demo-token': token },
      payload: { cenario: 'chuva-forte' },
    });

    expect(problema(res, 403).title).toBe('Token de demonstração inválido');
    expect(problema(res, 403).code).toBe('FORBIDDEN');
    expect(cenario.nome).toBe('real');
  });

  it('token certo: GET mostra o cenário ativo e o catálogo', async () => {
    const { app } = await montarApp();

    const res = await app.inject({ method: 'GET', url: URL, headers: { 'x-demo-token': TOKEN } });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ cenario: 'real', simulado: false });
    expect(body.disponiveis.map((c: { nome: string }) => c.nome)).toEqual([...NOMES_CENARIO]);
  });

  it('token certo: POST troca o cenário e devolve o anterior; o GET seguinte reflete a troca', async () => {
    const { app, cenario } = await montarApp();
    const headers = { 'x-demo-token': TOKEN };

    const res = await app.inject({ method: 'POST', url: URL, headers, payload: { cenario: 'chuva-forte' } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ cenario: 'chuva-forte', anterior: 'real', simulado: true });
    expect(cenario.nome).toBe('chuva-forte');
    const get = await app.inject({ method: 'GET', url: URL, headers });
    expect(get.json()).toMatchObject({ cenario: 'chuva-forte', simulado: true });
  });

  it.each([{ cenario: 'nao-existe' }, {}, { cenario: 'normal', extra: 1 }, 'texto'])(
    'corpo inválido %j → 400 problem+json e o cenário não muda',
    async (payload) => {
      const { app, cenario } = await montarApp();

      const res = await app.inject({
        method: 'POST',
        url: URL,
        headers: { 'x-demo-token': TOKEN, 'content-type': 'application/json' },
        payload: JSON.stringify(payload),
      });

      const body = problema(res, 400);
      expect(body).toMatchObject({ title: 'Entrada inválida', code: 'VALIDATION_ERROR', instance: URL });
      expect(body.errors?.length).toBeGreaterThan(0);
      expect(cenario.nome).toBe('real');
    },
  );

  it('o token nunca aparece no log (nem o certo nem o errado)', async () => {
    const logs: string[] = [];
    const { app } = await montarApp({}, logs);

    await app.inject({ method: 'POST', url: URL, headers: { 'x-demo-token': TOKEN }, payload: { cenario: 'normal' } });
    await app.inject({ method: 'POST', url: URL, headers: { 'x-demo-token': 'tentativa-secreta' }, payload: { cenario: 'normal' } });

    const tudo = logs.join('\n');
    expect(tudo).toContain('cenário de demonstração ativado');
    expect(tudo).toContain('acesso negado ao modo demonstração');
    expect(tudo).not.toContain(TOKEN);
    expect(tudo).not.toContain('tentativa-secreta');
  });

  it('DEMO_MODE=true sem DEMO_TOKEN falha ao subir', async () => {
    const app = fastify();
    apps.push(app);
    app.register(demoRoutes, { demoMode: true, demoToken: '', cenario: new CenarioAtivo(new FakeClock()) });
    await expect(app.ready()).rejects.toThrow('DEMO_MODE=true exige DEMO_TOKEN');
  });

  it('TC24 ponta a ponta: POST chuva-forte → briefing AGUARDAR; depois DEMO_MODE=false → 404 e provedores reais', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const demo = montarDemo();
    const { app } = await montarApp({ cenario: demo.cenario });

    const res = await app.inject({
      method: 'POST',
      url: URL,
      headers: { 'x-demo-token': TOKEN },
      payload: { cenario: 'chuva-forte' },
    });
    expect(res.statusCode).toBe(200);
    expect(selecionarProvedores({ demoMode: true, cenario: demo.cenario, reais: 'reais', simulados: 'simulados' })).toBe(
      'simulados',
    );
    expect((await briefingSimulado(demo)).veredito).toBe('AGUARDAR');

    // Reinício com DEMO_MODE=false, mesmo estado em memória
    const { app: desligado } = await montarApp({ demoMode: false, demoToken: undefined, cenario: demo.cenario });
    const off = await desligado.inject({
      method: 'POST',
      url: URL,
      headers: { 'x-demo-token': TOKEN },
      payload: { cenario: 'normal' },
    });
    problema(off, 404);
    expect(selecionarProvedores({ demoMode: false, cenario: demo.cenario, reais: 'reais', simulados: 'simulados' })).toBe(
      'reais',
    );
  });
});
