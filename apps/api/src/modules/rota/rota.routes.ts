// GET /v1/rota?de=lat,lon&para=lat,lon&modo=a-pe|carro (RF24, contrato 1.5.0): rota real para a aba Mapa.
// `a-pe` só pela TomTom (o OSRM público não tem perfil a pé); `carro` pela TomTom com trânsito e, se ela falhar,
// pelo OSRM. Sem rota → 503 problem+json. NUNCA devolve linha reta (decisão do usuário de 14/10/2026).
// Cache e limitadores são os do runner único (TomTom: carro 5 min, a pé 1 dia, por par arredondado a ~11 m).
import { LatLonSchema, ModoRotaSchema, RotaResponseSchema, type ProblemDetails, type RotaResponse } from '@kairos/contracts';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ProviderRunner } from '../../infrastructure/provider-runner.js';
import type { Provider } from '../../infrastructure/provider.js';
import type { RotaInput, RotaOsrm } from '../../providers/routing/osrm.adapter.js';
import type { RotaTomTom } from '../../providers/routing/tomtom.adapter.js';

/** Prazo da rota, contando a fila dos limitadores (C.5). */
export const PRAZO_ROTA_MS = 4_000;

const PontoSchema = z
  .string({ required_error: 'informe o ponto como lat,lon' })
  .regex(/^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$/, 'use o formato lat,lon (graus decimais)')
  .transform((s) => {
    const [lat, lon] = s.split(',').map(Number);
    return { lat: lat!, lon: lon! };
  })
  .pipe(LatLonSchema);

export const RotaQuerySchema = z.object({
  de: PontoSchema,
  para: PontoSchema,
  modo: ModoRotaSchema.default('carro'),
});

export interface RotaRoutesOptions {
  runner: Pick<ProviderRunner, 'execute'>;
  /** null sem TOMTOM_KEY: `a-pe` → 503; `carro` só pelo OSRM. */
  tomtom: { carro: Provider<RotaInput, RotaTomTom>; aPe: Provider<RotaInput, RotaTomTom> } | null;
  osrm: Provider<RotaInput, RotaOsrm>;
  prazoMs?: number;
}

function indisponivel(request: FastifyRequest, reply: FastifyReply, detail: string) {
  const problem: ProblemDetails = {
    type: 'https://kairos.local/problems/provider-unavailable',
    title: 'Rota indisponível no momento',
    status: 503,
    detail,
    instance: request.url,
    code: 'PROVIDER_UNAVAILABLE',
  };
  return reply.code(503).type('application/problem+json').send(problem);
}

export const rotaRoutes: FastifyPluginAsync<RotaRoutesOptions> = async (app, opts) => {
  const prazoMs = opts.prazoMs ?? PRAZO_ROTA_MS;

  app.get('/v1/rota', async (request, reply) => {
    const parsed = RotaQuerySchema.safeParse(request.query);
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
    const { de, para, modo } = parsed.data;
    const entrada: RotaInput = { origem: de, destino: para };
    const run = { logger: request.log, signal: AbortSignal.timeout(prazoMs) };
    const motivos: string[] = [];

    if (opts.tomtom) {
      const o = await opts.runner.execute(modo === 'carro' ? opts.tomtom.carro : opts.tomtom.aPe, entrada, run);
      if (o.status !== 'unavailable') {
        const resposta: RotaResponse = {
          modo,
          fonte: 'tomtom',
          distanciaM: o.value.distanciaM,
          duracaoS: o.value.duracaoS,
          atrasoTransitoS: modo === 'carro' ? o.value.atrasoS : null,
          coordenadas: o.value.coordenadas,
          observedAt: o.observedAt,
        };
        return RotaResponseSchema.parse(resposta);
      }
      motivos.push(`TomTom: ${o.motivo}`);
    } else {
      motivos.push('TomTom não configurada no servidor');
    }

    if (modo === 'a-pe') {
      return indisponivel(request, reply, `${motivos.join('; ')}. Rota a pé só pela TomTom (o OSRM público não tem perfil a pé).`);
    }
    const o = await opts.runner.execute(opts.osrm, entrada, run);
    if (o.status !== 'unavailable') {
      const resposta: RotaResponse = {
        modo,
        fonte: 'osrm',
        distanciaM: o.value.distanciaM,
        duracaoS: Math.round(o.value.duracaoS),
        atrasoTransitoS: null,
        coordenadas: o.value.coordenadas,
        observedAt: o.observedAt,
      };
      return RotaResponseSchema.parse(resposta);
    }
    motivos.push(`OSRM: ${o.motivo}`);
    return indisponivel(request, reply, `${motivos.join('; ')}. Tente de novo em instantes.`);
  });
};
