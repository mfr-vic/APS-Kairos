import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { BriefingResponseSchema, ProblemDetailsSchema } from '@kairos/contracts';
import { buildApp } from '../../../src/app.js';
import { briefingRoutes } from '../../../src/modules/briefing/briefing.routes.js';
import { ATRIBUICAO_SIMULADO } from '../../../src/modules/briefing/briefing.service.js';
import { bancoFora, httpSemRede, montarBriefing, type MontarOpcoes } from './helpers.js';

const exemplo = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../../../packages/contracts/examples/briefing-request.json', import.meta.url)),
    'utf8',
  ),
);
const TOKEN = 'token-de-teste-com-mais-de-32-caracteres-0123';

let fechar: (() => Promise<unknown>) | undefined;
afterEach(async () => {
  await fechar?.();
  fechar = undefined;
});

async function appComService(opcoes: MontarOpcoes = {}) {
  const app = fastify();
  await app.register(briefingRoutes, { briefing: montarBriefing(opcoes).service });
  fechar = () => app.close();
  return app;
}

/** App completo sem rede: http falso, banco fora e demo ligada. */
function appDemo() {
  const app = buildApp({ config: { demoMode: true, demoToken: TOKEN }, deps: { http: httpSemRede, db: bancoFora } });
  fechar = () => app.close();
  return app;
}

describe('POST /v1/briefings (T27, RF05)', () => {
  it('exemplo do contrato → 200 FAVORAVEL no contrato', async () => {
    const app = await appComService();
    const res = await app.inject({ method: 'POST', url: '/v1/briefings', payload: exemplo });
    expect(res.statusCode).toBe(200);
    expect(BriefingResponseSchema.parse(res.json()).veredito).toBe('FAVORAVEL');
  });

  it('lat = 200 e sem destino → 400 problem+json (TC21)', async () => {
    const app = await appComService();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/briefings',
      payload: { trajeto: { origem: { lat: 200, lon: -46.6 } } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    const problem = ProblemDetailsSchema.parse(res.json());
    expect(problem.code).toBe('VALIDATION_ERROR');
    expect(problem.errors?.map((e) => e.path)).toEqual(
      expect.arrayContaining(['trajeto.origem.lat', 'trajeto.destino']),
    );
  });

  it('app completo sem rede nem banco: 200, tudo unavailable → INDETERMINADO (sem 500)', async () => {
    const app = appDemo();
    const res = await app.inject({ method: 'POST', url: '/v1/briefings', payload: exemplo });
    expect(res.statusCode).toBe(200);
    const body = BriefingResponseSchema.parse(res.json());
    expect(body.veredito).toBe('INDETERMINADO');
    expect(body.observacoes.every((o) => o.status === 'unavailable')).toBe(true);
    expect(body.geometria.fonte).toBe('linha-reta');
    expect(body.atribuicoes).toEqual([]);
  });

  it('demo ponta a ponta: POST /v1/demo/scenario chuva-forte → briefing AGUARDAR com dados simulados', async () => {
    const app = appDemo();
    const ativar = await app.inject({
      method: 'POST',
      url: '/v1/demo/scenario',
      headers: { 'x-demo-token': TOKEN },
      payload: { cenario: 'chuva-forte' },
    });
    expect(ativar.statusCode).toBe(200);

    const res = await app.inject({ method: 'POST', url: '/v1/briefings', payload: exemplo });
    expect(res.statusCode).toBe(200);
    const body = BriefingResponseSchema.parse(res.json());
    expect(body.veredito).toBe('AGUARDAR');
    expect(body.motivos.map((m) => m.regra)).toContain('RN01');
    expect(body.atribuicoes).toContain(ATRIBUICAO_SIMULADO);
  });

  it('demo com token errado → 403 FORBIDDEN e o briefing continua real', async () => {
    const app = appDemo();
    const ativar = await app.inject({
      method: 'POST',
      url: '/v1/demo/scenario',
      headers: { 'x-demo-token': 'errado' },
      payload: { cenario: 'chuva-forte' },
    });
    expect(ativar.statusCode).toBe(403);
    expect(ativar.json().code).toBe('FORBIDDEN');
    const res = await app.inject({ method: 'POST', url: '/v1/briefings', payload: exemplo });
    expect(res.json().veredito).toBe('INDETERMINADO');
  });
});
