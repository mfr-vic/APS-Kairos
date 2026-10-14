// GET /v1/rota (contrato 1.5.0): rota real entre dois pontos para a aba Mapa (você → origem a pé;
// origem → destino de carro/ônibus). Sem rota, a API responde 503 e o app NÃO cai para linha reta.
import { RotaResponseSchema, type LatLon, type ModoRota, type RotaResponse } from '@kairos/contracts';

import { requisitar } from './client';

/** 5 casas ≈ 1 m: a chave do cache não muda a cada leitura do GPS. */
const coord = (p: LatLon) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;

export const chaveRota = (de: LatLon, para: LatLon, modo: ModoRota) => ['rota', modo, coord(de), coord(para)] as const;

export function buscarRota(de: LatLon, para: LatLon, modo: ModoRota, signal?: AbortSignal): Promise<RotaResponse> {
  return requisitar(`/v1/rota?de=${coord(de)}&para=${coord(para)}&modo=${modo}`, RotaResponseSchema, { signal });
}
