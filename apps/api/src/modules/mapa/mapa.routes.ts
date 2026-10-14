// GET /v1/mapa/camadas (RF23, contrato 1.4.0): camadas filtráveis da aba Mapa — pontos históricos de
// alagamento (PostGIS) e grade de chuva/temperatura (Open-Meteo, uma chamada). As duas fontes correm em
// paralelo pelo runner único; uma fora vira camada `unavailable` com motivo e a outra segue (nunca 500).
import { MapaCamadasResponseSchema, type MapaCamadasResponse, type MapaPontoAlagamento } from '@kairos/contracts';
import type { FastifyPluginAsync } from 'fastify';
import type { ProviderOutcome, ProviderRunner } from '../../infrastructure/provider-runner.js';
import type { Provider } from '../../infrastructure/provider.js';
import { CHUVA_FRACA_MAX_MM_H, CHUVA_MODERADA_MAX_MM_H, RAIO_ALAGAMENTO_M } from '../rules/thresholds.js';
import type { GradeClima } from './grade-clima.adapter.js';

/** Mesmo prazo global do briefing (C.5). */
export const PRAZO_CAMADAS_MS = 4_000;

export interface MapaRoutesOptions {
  runner: Pick<ProviderRunner, 'execute'>;
  alagamento: Provider<void, MapaPontoAlagamento[]>;
  clima: Provider<void, GradeClima>;
  prazoMs?: number;
}

function meta(source: string, o: ProviderOutcome<unknown>) {
  return { source, status: o.status, observedAt: o.observedAt, motivo: o.motivo ?? null };
}

export const mapaRoutes: FastifyPluginAsync<MapaRoutesOptions> = async (app, opts) => {
  app.get('/v1/mapa/camadas', async (request) => {
    const run = { logger: request.log, signal: AbortSignal.timeout(opts.prazoMs ?? PRAZO_CAMADAS_MS) };
    const [alag, clima] = await Promise.all([
      opts.runner.execute(opts.alagamento, undefined, run),
      opts.runner.execute(opts.clima, undefined, run),
    ]);
    const resposta: MapaCamadasResponse = {
      limiares: {
        chuvaAtencaoMmH: CHUVA_FRACA_MAX_MM_H,
        chuvaAguardarMmH: CHUVA_MODERADA_MAX_MM_H,
        raioAlagamentoM: RAIO_ALAGAMENTO_M,
      },
      alagamento: { ...meta(opts.alagamento.source, alag), pontos: alag.value ?? [] },
      clima: {
        ...meta(opts.clima.source, clima),
        horaPrevista: clima.value?.horaPrevista ?? null,
        pontos: clima.value?.pontos ?? [],
      },
    };
    return MapaCamadasResponseSchema.parse(resposta);
  });
};
