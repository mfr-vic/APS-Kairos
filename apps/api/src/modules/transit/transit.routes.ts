// Rotas de transporte por ônibus (T18, RF02, C.4): busca de linhas e paradas no Olho Vivo.
// Plugin Fastify; o registro no app.ts é da T27. /v1/transit/rail/lines é de outra tarefa.
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  BusLinesResponseSchema,
  BusStopsResponseSchema,
  CodigoLinhaSchema,
  type ErrorCode,
  type ProblemDetails,
} from '@kairos/contracts';
import type { ProviderErrorKind } from '../../infrastructure/errors.js';
import { parseWithSchema } from '../../infrastructure/http-client.js';
import type { ProviderRunner } from '../../infrastructure/provider-runner.js';
import type { Provider } from '../../infrastructure/provider.js';
import {
  OlhoVivoBuscaLinhasAdapter,
  OlhoVivoBuscaParadasAdapter,
} from '../../providers/transit/olhovivo-busca.adapter.js';
import type { OlhoVivoClient } from '../../providers/transit/olhovivo.client.js';

export interface TransitRoutesOptions {
  /** O ProviderRunner único do app (cache e breaker compartilhados com o briefing). */
  runner: ProviderRunner;
  /** O OlhoVivoClient único do app (uma sessão para previsão e buscas). */
  olhoVivo: OlhoVivoClient;
}

export const BusLinesQuerySchema = z.object({
  q: z.string().trim().min(1, 'informe o termo de busca').max(60),
});

export const BusStopsQuerySchema = z.object({
  lineCode: z.coerce.number().pipe(CodigoLinhaSchema),
});

function problemaValidacao(request: FastifyRequest, issues: z.ZodIssue[]): ProblemDetails {
  const errors = issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
  return {
    type: 'https://kairos.local/problems/validation',
    title: 'Entrada inválida',
    status: 400,
    detail: errors.map((e) => `${e.path}: ${e.message}`).join('; '),
    instance: request.url,
    code: 'VALIDATION_ERROR',
    errors,
  };
}

function codigoDoErro(erro: ProviderErrorKind | undefined): ErrorCode {
  if (erro === 'circuit-open') return 'CIRCUIT_BREAKER_OPEN';
  if (erro === 'timeout') return 'TIMEOUT';
  return 'PROVIDER_UNAVAILABLE';
}

export const transitRoutes: FastifyPluginAsync<TransitRoutesOptions> = async (app, opts) => {
  const buscaLinhas = new OlhoVivoBuscaLinhasAdapter(opts.olhoVivo);
  const buscaParadas = new OlhoVivoBuscaParadasAdapter(opts.olhoVivo);

  /** Executa a busca; dado fresh ou stale → 200, unavailable → 503 problem+json. */
  async function responder<TInput, TValue>(
    request: FastifyRequest,
    reply: FastifyReply,
    provider: Provider<TInput, TValue>,
    input: TInput,
    schema: z.ZodType<TValue, z.ZodTypeDef, unknown>,
  ) {
    const outcome = await opts.runner.execute(provider, input, { logger: request.log }, (v) =>
      parseWithSchema(schema, v),
    );
    if (outcome.status === 'unavailable') {
      const problem: ProblemDetails = {
        type: 'https://kairos.local/problems/provider-unavailable',
        title: 'Olho Vivo (SPTrans) indisponível no momento',
        status: 503,
        detail: outcome.motivo,
        instance: request.url,
        code: codigoDoErro(outcome.erro),
      };
      return reply.code(503).type('application/problem+json').send(problem);
    }
    return outcome.value;
  }

  // RF02: buscar "875A" retorna as linhas (um código por sentido)
  app.get('/v1/transit/bus/lines', async (request, reply) => {
    const parsed = BusLinesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).type('application/problem+json').send(problemaValidacao(request, parsed.error.issues));
    }
    return responder(request, reply, buscaLinhas, parsed.data.q, BusLinesResponseSchema);
  });

  // RF02: paradas de uma linha (código de um sentido, ex.: 609)
  app.get('/v1/transit/bus/stops', async (request, reply) => {
    const parsed = BusStopsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).type('application/problem+json').send(problemaValidacao(request, parsed.error.issues));
    }
    return responder(request, reply, buscaParadas, parsed.data.lineCode, BusStopsResponseSchema);
  });
};
