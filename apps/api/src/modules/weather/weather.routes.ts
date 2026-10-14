// GET /v1/weather?lat=&lon= (widget "tempo agora" do app, C.4): devolve a MESMA Observation de clima
// do briefing, pelo mesmo adaptador e cache do runner (a cacheKey arredonda a 2 casas, então a cidade
// inteira compartilha poucas entradas). Fonte fora → Observation `unavailable` com motivo, nunca 500.
import { LatLonSchema, type LatLon, type ProblemDetails } from '@kairos/contracts';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ProviderRunner } from '../../infrastructure/provider-runner.js';
import type { DimensionProvider } from '../../infrastructure/provider.js';

/** Query string → números → limites do contrato (lat ∈ [-90, 90], lon ∈ [-180, 180]). */
export const WeatherQuerySchema = z
  .object({ lat: z.coerce.number(), lon: z.coerce.number() })
  .pipe(LatLonSchema);

export interface WeatherRoutesOptions {
  /** O runner único da aplicação (mesmo cache/breaker do briefing). */
  runner: Pick<ProviderRunner, 'observe'>;
  weather: DimensionProvider<LatLon, 'weather'>;
}

export const weatherRoutes: FastifyPluginAsync<WeatherRoutesOptions> = async (app, opts) => {
  app.get('/v1/weather', async (request, reply) => {
    const parsed = WeatherQuerySchema.safeParse(request.query);
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
    return opts.runner.observe(opts.weather, parsed.data, { logger: request.log });
  });
};
