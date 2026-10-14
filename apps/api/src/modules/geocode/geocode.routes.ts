// GET /v1/geocode?q= (T20, RF01, ADR-15): busca de endereço pelo Nominatim, só pelo backend.
// Plugin Fastify; o registro no app.ts fica para a T27. Sem autocomplete: o app chama ao confirmar.
import { GeocodeResponseSchema, type GeocodeResponse, type ProblemDetails } from '@kairos/contracts';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ProviderRunner } from '../../infrastructure/provider-runner.js';
import type { Provider } from '../../infrastructure/provider.js';

/** Prazo da rota, contando a espera na fila de 1 req/s (a fila não cresce sem limite). */
export const PRAZO_GEOCODE_MS = 4_000;

export const GeocodeQuerySchema = z.object({
  q: z
    .string({ required_error: 'informe o endereço em q' })
    .trim()
    .min(3, 'o endereço deve ter pelo menos 3 caracteres')
    .max(200, 'o endereço deve ter no máximo 200 caracteres'),
});

export interface GeocodeRoutesOptions {
  /** O runner único da aplicação (cache de 30 dias, breaker e limitador do Nominatim). */
  runner: ProviderRunner;
  nominatim: Provider<string, GeocodeResponse>;
  prazoMs?: number;
}

export const geocodeRoutes: FastifyPluginAsync<GeocodeRoutesOptions> = async (app, opts) => {
  const prazoMs = opts.prazoMs ?? PRAZO_GEOCODE_MS;

  app.get('/v1/geocode', async (request, reply) => {
    const parsed = GeocodeQuerySchema.safeParse(request.query);
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

    const outcome = await opts.runner.execute(opts.nominatim, parsed.data.q, {
      logger: request.log,
      signal: AbortSignal.timeout(prazoMs),
    });
    if (outcome.status === 'unavailable') {
      const problem: ProblemDetails = {
        type: 'https://kairos.local/problems/provider-unavailable',
        title: 'Busca de endereço indisponível no momento',
        status: 503,
        detail: `${outcome.motivo}. Tente de novo em instantes ou use a localização do aparelho.`,
        instance: request.url,
        code: 'PROVIDER_UNAVAILABLE',
      };
      return reply.code(503).type('application/problem+json').send(problem);
    }
    return GeocodeResponseSchema.parse(outcome.value);
  });
};
