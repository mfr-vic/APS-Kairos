// GET /v1/mapa/transito/{z}/{x}/{y}.png (RF22, aba Mapa): proxy dos tiles de fluxo da TomTom. A chave fica no
// servidor. Para proteger a cota gratuita (200 mil tiles/mês), só zoom 10–18 e só tiles que tocam o município
// de São Paulo; fora disso, 400. Fonte fora, sem chave ou cota esgotada → 503 problem+json.
import type { ProblemDetails } from '@kairos/contracts';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { motivoDoErro, toProviderError } from '../../infrastructure/errors.js';
import { TOMTOM_TILE_TTL_S, type TileXYZ, type TomTomFlowTiles } from '../../providers/traffic/tomtom-flow-tiles.adapter.js';

export const ZOOM_TRANSITO_MIN = 10;
export const ZOOM_TRANSITO_MAX = 18;
/** Retângulo envolvente do município de São Paulo (graus), com folga de ~1 km. */
export const BBOX_SAO_PAULO = { latMin: -24.02, latMax: -23.35, lonMin: -46.83, lonMax: -46.36 } as const;

const inteiro = z.coerce.number().int().min(0);
export const TileParamsSchema = z
  .object({ z: inteiro.min(ZOOM_TRANSITO_MIN).max(ZOOM_TRANSITO_MAX), x: inteiro, y: inteiro })
  .refine((t) => t.x < 2 ** t.z && t.y < 2 ** t.z, { message: 'x e y devem estar em [0, 2^z)' })
  .refine((t) => tocaSaoPaulo(t), { message: 'tile fora da cidade de São Paulo' });

/** Limites do tile XYZ (Web Mercator) em graus. */
export function limitesDoTile({ z, x, y }: TileXYZ) {
  const n = 2 ** z;
  const lat = (yy: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * yy) / n))) * 180) / Math.PI;
  return { lonMin: (x / n) * 360 - 180, lonMax: ((x + 1) / n) * 360 - 180, latMax: lat(y), latMin: lat(y + 1) };
}

export function tocaSaoPaulo(t: TileXYZ): boolean {
  const b = limitesDoTile(t);
  const sp = BBOX_SAO_PAULO;
  return b.lonMax >= sp.lonMin && b.lonMin <= sp.lonMax && b.latMax >= sp.latMin && b.latMin <= sp.latMax;
}

export interface TransitoRoutesOptions {
  /** null sem TOMTOM_KEY. */
  tiles: Pick<TomTomFlowTiles, 'obter'> | null;
}

function problema(request: FastifyRequest, reply: FastifyReply, status: 400 | 503, detail: string, errors?: { path: string; message: string }[]) {
  const problem: ProblemDetails = {
    type: `https://kairos.local/problems/${status === 400 ? 'validation' : 'provider-unavailable'}`,
    title: status === 400 ? 'Entrada inválida' : 'Camada de trânsito indisponível no momento',
    status,
    detail,
    instance: request.url,
    code: status === 400 ? 'VALIDATION_ERROR' : 'PROVIDER_UNAVAILABLE',
    ...(errors ? { errors } : {}),
  };
  return reply.code(status).type('application/problem+json').send(problem);
}

export const transitoRoutes: FastifyPluginAsync<TransitoRoutesOptions> = async (app, opts) => {
  app.get('/v1/mapa/transito/:z/:x/:y.png', async (request, reply) => {
    const parsed = TileParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
      return problema(request, reply, 400, errors.map((e) => `${e.path || '(tile)'}: ${e.message}`).join('; '), errors);
    }
    if (!opts.tiles) return problema(request, reply, 503, 'TomTom não configurada no servidor (sem TOMTOM_KEY)');
    try {
      const { png, cache } = await opts.tiles.obter(parsed.data, AbortSignal.timeout(4_000));
      return reply
        .type('image/png')
        .header('cache-control', `public, max-age=${TOMTOM_TILE_TTL_S}`)
        .header('x-cache', cache)
        .send(png);
    } catch (err) {
      const erro = toProviderError(err);
      request.log.warn({ provider: 'tomtom-tiles', erro: erro.kind, mensagem: erro.message }, 'falha no tile de trânsito');
      return problema(request, reply, 503, motivoDoErro(erro));
    }
  });
};
