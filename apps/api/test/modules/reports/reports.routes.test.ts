// GET /v1/reports/summary (T32, RF26): validação, resposta no contrato e banco fora → 503.
import fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { ProblemDetailsSchema, ReportsSummaryResponseSchema } from '@kairos/contracts';
import { reportsRoutes } from '../../../src/modules/reports/reports.routes.js';
import { ReportsService } from '../../../src/modules/reports/reports.service.js';
import { FakeClock } from '../../infrastructure/helpers.js';
import { bancoFora } from '../briefing/helpers.js';
import { bancoFalso, type Respostas } from './helpers.js';

let fechar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await fechar?.();
  fechar = null;
});

function montar(db = bancoFalso().db) {
  const app = fastify();
  app.register(reportsRoutes, { reports: new ReportsService(db, new FakeClock(Date.parse('2026-10-14T15:00:00Z'))) });
  fechar = () => app.close();
  return app;
}

const COM_DADOS: Respostas = {
  totais: [{ total: 2, distintos: 1, p50: 900, p95: 1500, max: 1600 }],
  porDia: [{ dia: '2026-10-14', FAVORAVEL: 1, ATENCAO: 1, AGUARDAR: 0, INDETERMINADO: 0 }],
  provedores: [{ provedor: 'geosampa', consultas: 2, fresh: 2, stale: 0, unavailable: 0 }],
};

describe('GET /v1/reports/summary', () => {
  it.each(['0', '91', '1.5', 'abc'])('dias=%s → 400 problem+json', async (dias) => {
    const res = await montar().inject({ method: 'GET', url: `/v1/reports/summary?dias=${dias}` });
    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(ProblemDetailsSchema.parse(res.json())).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  it('sem dias → padrão 7; banco vazio → 200 com zeros', async () => {
    const res = await montar().inject({ method: 'GET', url: '/v1/reports/summary' });
    expect(res.statusCode).toBe(200);
    const r = ReportsSummaryResponseSchema.parse(res.json());
    expect(r.periodo.dias).toBe(7);
    expect(r).toMatchObject({ totalBriefings: 0, trajetosDistintos: 0, latenciaMs: null, vereditosPorDia: [], disponibilidadePorProvedor: [] });
  });

  it('com dados → 200 no contrato', async () => {
    const res = await montar(bancoFalso(COM_DADOS).db).inject({ method: 'GET', url: '/v1/reports/summary?dias=90' });
    expect(res.statusCode).toBe(200);
    const r = ReportsSummaryResponseSchema.parse(res.json());
    expect(r.periodo.dias).toBe(90);
    expect(r.disponibilidadePorProvedor[0]).toMatchObject({ provedor: 'geosampa', disponibilidadePct: 100 });
    expect(r.latenciaMs).toEqual({ p50: 900, p95: 1500, max: 1600 });
  });

  it('banco fora → 503 problem+json', async () => {
    const res = await montar(bancoFora).inject({ method: 'GET', url: '/v1/reports/summary?dias=1' });
    expect(res.statusCode).toBe(503);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(ProblemDetailsSchema.parse(res.json())).toMatchObject({ status: 503, code: 'PROVIDER_UNAVAILABLE' });
  });
});
