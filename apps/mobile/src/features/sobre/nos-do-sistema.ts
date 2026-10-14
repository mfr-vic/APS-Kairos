// Nós do sistema distribuído do Καιρός (tela "Como o Καιρός funciona"): o app, a API e as fontes.
// `fontes` = nomes do /v1/health/providers (FONTES_SAUDE em apps/api/src/modules/health/health.routes.ts).
import type { ProviderStatus, ProvidersHealthResponse } from '@kairos/contracts';

import type { IconName } from '@/components/icon';
import type { Tom } from '@/theme';

type ProviderHealth = ProvidersHealthResponse['providers'][number];

export type NoFonte = {
  id: string;
  nome: string;
  papel: string;
  icone: IconName;
  fontes: readonly string[];
};

export const NOS_DO_SISTEMA: readonly NoFonte[] = [
  { id: 'clima', nome: 'Open-Meteo', papel: 'Chuva, temperatura e previsão hora a hora', icone: 'clima', fontes: ['open-meteo'] },
  { id: 'ar', nome: 'Open-Meteo (CAMS)', papel: 'Qualidade do ar (MP2,5, modelo CAMS)', icone: 'ar', fontes: ['open-meteo-air-quality'] },
  { id: 'onibus', nome: 'SPTrans Olho Vivo', papel: 'Previsão de chegada do ônibus no ponto', icone: 'onibus', fontes: ['sptrans-olhovivo'] },
  { id: 'artesp', nome: 'ARTESP', papel: 'Situação das linhas 4 a 9 (com chave)', icone: 'metro', fontes: ['artesp'] },
  { id: 'metro', nome: 'Direto do Metrô', papel: 'Situação das linhas 1, 2, 3, 4, 5 e 15', icone: 'metro', fontes: ['metro-sp'] },
  { id: 'transito', nome: 'TomTom', papel: 'Rota com trânsito ao vivo, rota a pé do mapa e camada de trânsito', icone: 'rota', fontes: ['tomtom'] },
  { id: 'rotas', nome: 'OSRM e Nominatim', papel: 'Rota reserva (sem trânsito) e busca de endereço', icone: 'rota', fontes: ['osrm', 'nominatim'] },
  { id: 'banco', nome: 'PostGIS (GeoSampa)', papel: 'Pontos de alagamento perto do traçado', icone: 'alagamento', fontes: ['geosampa'] },
];

const GRAVIDADE: Record<ProviderStatus, number> = { ok: 0, desconhecido: 1, degradado: 2, indisponivel: 3 };

export const TEXTO_ESTADO: Record<ProviderStatus, { texto: string; tom: Tom }> = {
  ok: { texto: 'respondendo', tom: 'ok' },
  degradado: { texto: 'instável', tom: 'atencao' },
  indisponivel: { texto: 'fora do ar', tom: 'erro' },
  desconhecido: { texto: 'ainda não consultada', tom: 'neutro' },
};

/**
 * Estado atual do nó a partir do /v1/health/providers: o pior estado entre as fontes do nó e a
 * última latência medida da mais lenta. Sem dados do servidor → desconhecido.
 */
export function estadoDoNo(
  no: Pick<NoFonte, 'fontes'>,
  providers: readonly ProviderHealth[] | undefined
): { status: ProviderStatus; latencyMs: number | null } {
  const todas = (providers ?? []).filter((p) => no.fontes.includes(p.name));
  if (todas.length === 0) return { status: 'desconhecido', latencyMs: null };
  // Fonte ainda não consultada não define o nó se outra dele já foi medida (OSRM consultado e
  // Nominatim não: o nó é "respondendo · 1694 ms", não "ainda não consultada · 1694 ms").
  const consultadas = todas.filter((p) => p.status !== 'desconhecido');
  const doNo = consultadas.length ? consultadas : todas;
  const status = doNo.reduce<ProviderStatus>(
    (pior, p) => (GRAVIDADE[p.status] > GRAVIDADE[pior] ? p.status : pior),
    'ok'
  );
  const latencias = doNo.map((p) => p.latencyMs).filter((l): l is number => l !== null);
  return { status, latencyMs: latencias.length ? Math.max(...latencias) : null };
}
