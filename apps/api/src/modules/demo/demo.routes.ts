// Rotas do modo demonstração (T21, RF19, C.4, C.7, TC24): GET/POST /v1/demo/scenario.
// Plugin Fastify; quem registra é o app (T27): app.register(demoRoutes, { demoMode, demoToken, cenario }).
// Proteções, nesta ordem: DEMO_MODE=false → 404 (como se a rota não existisse); sem X-Demo-Token → 401;
// token diferente de DEMO_TOKEN → 403 (comparação em tempo constante). O token nunca vai para o log.
import { createHash, timingSafeEqual } from 'node:crypto';
import type { ErrorCode, ProblemDetails } from '@kairos/contracts';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { CenarioAtivo } from './cenario-ativo.js';
import { CENARIOS, NOMES_CENARIO, NomeCenarioSchema, type NomeCenario } from './cenarios.js';

export const ROTA_CENARIO = '/v1/demo/scenario';
export const HEADER_TOKEN = 'x-demo-token';

export interface DemoRoutesOptions {
  /** DEMO_MODE=true. Lido do ambiente por quem registra o plugin, nunca aqui dentro. */
  demoMode: boolean;
  /** DEMO_TOKEN. Obrigatório com demoMode = true. */
  demoToken: string | undefined;
  /** Estado compartilhado com os provedores simulados. */
  cenario: CenarioAtivo;
}

export const AtivarCenarioRequestSchema = z.object({ cenario: NomeCenarioSchema }).strict();

/** Resposta de GET e POST (fora do contrato v1 do app: a rota é só do apresentador). */
export interface CenarioAtivoResponse {
  cenario: NomeCenario;
  descricao: string;
  /** true se o briefing está usando os provedores simulados. */
  simulado: boolean;
  ativadoEm: string;
  /** Só no POST. */
  anterior?: NomeCenario;
  /** Só no GET: catálogo para o apresentador. */
  disponiveis?: { nome: NomeCenario; descricao: string }[];
}

function sha256(texto: string): Buffer {
  return createHash('sha256').update(texto, 'utf8').digest();
}

function problema(
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  tipo: string,
  title: string,
  code: ErrorCode,
  extra: Pick<ProblemDetails, 'detail' | 'errors'> = {},
) {
  const problem: ProblemDetails = {
    type: `https://kairos.local/problems/${tipo}`,
    title,
    status,
    instance: request.url,
    code,
    ...extra,
  };
  return reply.code(status).type('application/problem+json').send(problem);
}

export const demoRoutes: FastifyPluginAsync<DemoRoutesOptions> = async (app, opts) => {
  const { demoMode, cenario } = opts;
  if (demoMode && !opts.demoToken) {
    throw new Error('DEMO_MODE=true exige DEMO_TOKEN configurado');
  }
  // Guarda só o hash: compara digests de mesmo tamanho com timingSafeEqual (não vaza o comprimento)
  const tokenHash = opts.demoToken ? sha256(opts.demoToken) : null;

  const proteger = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!demoMode || !tokenHash) {
      return problema(request, reply, 404, 'not-found', 'Recurso não encontrado', 'NOT_FOUND');
    }
    const recebido = request.headers[HEADER_TOKEN];
    if (typeof recebido !== 'string' || recebido.length === 0) {
      request.log.warn({ rota: ROTA_CENARIO, motivo: 'sem token' }, 'acesso negado ao modo demonstração');
      return problema(request, reply, 401, 'unauthorized', 'Token de demonstração ausente', 'UNAUTHORIZED', {
        detail: 'Envie o header X-Demo-Token',
      });
    }
    if (!timingSafeEqual(sha256(recebido), tokenHash)) {
      request.log.warn({ rota: ROTA_CENARIO, motivo: 'token inválido' }, 'acesso negado ao modo demonstração');
      return problema(request, reply, 403, 'forbidden', 'Token de demonstração inválido', 'FORBIDDEN');
    }
  };

  const estadoAtual = (): CenarioAtivoResponse => ({
    cenario: cenario.nome,
    descricao: CENARIOS[cenario.nome].descricao,
    simulado: cenario.usaSimulados(),
    ativadoEm: cenario.ativadoEm,
  });

  app.get(ROTA_CENARIO, { preHandler: proteger }, async () => {
    const resposta: CenarioAtivoResponse = {
      ...estadoAtual(),
      disponiveis: NOMES_CENARIO.map((nome) => ({ nome, descricao: CENARIOS[nome].descricao })),
    };
    return resposta;
  });

  app.post(ROTA_CENARIO, { preHandler: proteger }, async (request, reply) => {
    const parsed = AtivarCenarioRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
      return problema(request, reply, 400, 'validation', 'Entrada inválida', 'VALIDATION_ERROR', {
        detail: errors.map((e) => `${e.path}: ${e.message}`).join('; '),
        errors,
      });
    }
    const anterior = cenario.ativar(parsed.data.cenario);
    request.log.info({ cenario: cenario.nome, anterior }, 'cenário de demonstração ativado');
    const resposta: CenarioAtivoResponse = { ...estadoAtual(), anterior };
    return resposta;
  });
};
