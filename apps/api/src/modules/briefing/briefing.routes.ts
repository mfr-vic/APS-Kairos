// POST /v1/briefings (T27, RF05, C.4): valida o trajeto pelo contrato (RNF10, TC21) e chama o BriefingService.
import { BriefingRequestSchema, type ProblemDetails } from '@kairos/contracts';
import type { FastifyPluginAsync } from 'fastify';
import type { BriefingService } from './briefing.service.js';

export interface BriefingRoutesOptions {
  briefing: Pick<BriefingService, 'gerar'>;
}

export const briefingRoutes: FastifyPluginAsync<BriefingRoutesOptions> = async (app, opts) => {
  app.post('/v1/briefings', async (request, reply) => {
    const parsed = BriefingRequestSchema.safeParse(request.body);
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
    return opts.briefing.gerar(parsed.data.trajeto, request.log);
  });
};
