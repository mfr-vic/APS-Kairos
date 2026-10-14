// GET /v1/mapa/camadas (contrato 1.4.0): alagamento, chuva e temperatura para os filtros da aba Mapa.
import { MapaCamadasResponseSchema, type MapaCamadasResponse } from '@kairos/contracts';

import { requisitar } from './client';

export const CHAVE_CAMADAS = ['mapa', 'camadas'] as const;

export function buscarCamadas(signal?: AbortSignal): Promise<MapaCamadasResponse> {
  return requisitar('/v1/mapa/camadas', MapaCamadasResponseSchema, { signal });
}
