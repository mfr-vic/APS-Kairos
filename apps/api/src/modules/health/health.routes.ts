// GET /v1/health e /v1/health/providers (T28, RF18, C.4). O estado das fontes vem só do que o
// ProviderRunner mediu (breaker, última latência, último sucesso, contadores desde que a API subiu);
// fonte nunca chamada = `desconhecido` com 0 requisições e latência média null.
import {
  HealthSchema,
  ProvidersHealthResponseSchema,
  type ProviderStatus,
  type ProvidersHealthResponse,
} from '@kairos/contracts';
import type { FastifyPluginAsync } from 'fastify';
import type { ProviderHealth, ProviderRunner } from '../../infrastructure/provider-runner.js';

/** Fontes reais na ordem exibida pelo app. ARTESP sem chave nunca é chamada → `desconhecido`. */
export const FONTES_SAUDE = [
  'open-meteo',
  'open-meteo-air-quality',
  'sptrans-olhovivo',
  'metro-sp',
  'geosampa',
  'osrm',
  'nominatim',
  'artesp',
  'tomtom',
] as const;

export interface HealthRoutesOptions {
  runner: Pick<ProviderRunner, 'health'>;
  fontes?: readonly string[];
}

export function statusDaFonte(h: ProviderHealth | undefined): ProviderStatus {
  if (!h) return 'desconhecido';
  if (h.breaker === 'open') return 'indisponivel';
  if (h.lastError !== null) return 'degradado';
  return h.lastSuccessAt ? 'ok' : 'desconhecido';
}

export function saudeDasFontes(health: readonly ProviderHealth[], fontes: readonly string[]): ProvidersHealthResponse {
  const porFonte = new Map(health.map((h) => [h.source, h]));
  return ProvidersHealthResponseSchema.parse({
    providers: fontes.map((name) => {
      const h = porFonte.get(name);
      return {
        name,
        status: statusDaFonte(h),
        latencyMs: h?.lastLatencyMs == null ? null : Math.max(0, Math.round(h.lastLatencyMs)),
        lastSuccessAt: h?.lastSuccessAt ?? null,
        requestCount: h?.requestCount ?? 0,
        successCount: h?.successCount ?? 0,
        avgLatencyMs: h?.avgLatencyMs == null ? null : Math.max(0, h.avgLatencyMs),
      };
    }),
  });
}

export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (app, opts) => {
  const fontes = opts.fontes ?? FONTES_SAUDE;
  app.get('/v1/health', async () => HealthSchema.parse({ status: 'up', timestamp: new Date().toISOString() }));
  app.get('/v1/health/providers', async () => saudeDasFontes(opts.runner.health(), fontes));
};
