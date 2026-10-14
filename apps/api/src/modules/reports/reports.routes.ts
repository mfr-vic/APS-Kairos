// GET /v1/reports/summary?dias=7 (T32, RF26, contrato 1.6.0): agregados do histórico de briefings.
// `dias` 1–90 (padrão 7) → 400 problem+json fora disso; banco fora → 503 problem+json.
import type { ProblemDetails } from '@kairos/contracts';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ReportsService } from './reports.service.js';

const QuerySchema = z.object({ dias: z.coerce.number().int().min(1).max(90).default(7) });

export interface ReportsRoutesOptions {
  reports: Pick<ReportsService, 'resumo'>;
}

export const reportsRoutes: FastifyPluginAsync<ReportsRoutesOptions> = async (app, opts) => {
  app.get('/v1/reports/summary', async (request, reply) => {
    const parsed = QuerySchema.safeParse(request.query);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
      const problem: ProblemDetails = {
        type: 'https://kairos.local/problems/validation',
        title: 'Entrada inválida',
        status: 400,
        detail: errors.map((e) => `${e.path}: ${e.message}`).join('; '),
        instance: request.url,
        code: 'VALIDATION_ERROR',
        errors,
      };
      return reply.code(400).type('application/problem+json').send(problem);
    }
    try {
      return await opts.reports.resumo(parsed.data.dias);
    } catch (err) {
      if (err instanceof z.ZodError) throw err; // resposta fora do contrato é defeito (500), não banco fora
      request.log.warn({ erro: (err as Error).message }, 'falha ao consultar o histórico de briefings');
      const problem: ProblemDetails = {
        type: 'https://kairos.local/problems/provider-unavailable',
        title: 'Relatório indisponível no momento',
        status: 503,
        detail: 'Banco de dados do histórico inacessível. Tente de novo em instantes.',
        instance: request.url,
        code: 'PROVIDER_UNAVAILABLE',
      };
      return reply.code(503).type('application/problem+json').send(problem);
    }
  });
};
