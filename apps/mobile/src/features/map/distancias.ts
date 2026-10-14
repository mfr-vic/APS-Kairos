// Distâncias da aba Mapa (decisão de 14/10/2026): você → origem (a pé) e origem → destino (de carro ou
// ônibus) vêm SEMPRE de uma rota calculada pela API (GET /v1/rota). Distância em linha reta não é
// apresentada ao usuário: sem rota, o cartão diz que a rota está indisponível.
import type { RotaResponse } from '@kairos/contracts';

import { formatarDuracao } from '@/features/briefing/transito';

/** "850 m", "1,2 km", "12 km" (pt-BR, vírgula decimal; sem Intl, que o Hermes pode não ter completo). */
export function formatarDistancia(m: number): string {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  if (m < 10_000) return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
  return `${Math.round(m / 1000)} km`;
}

/** Atraso de trânsito a partir do qual vale citar (abaixo de 1 min é ruído). */
const ATRASO_RELEVANTE_S = 60;

/**
 * "1,2 km · 15 min a pé"; "8,4 km · 22 min de carro agora, +6 min de trânsito".
 * `valor` = distância (número grande do cartão); `detalhe` = tempo e trânsito.
 */
export function textoDaRota(r: RotaResponse): { valor: string; detalhe: string } {
  const tempo = formatarDuracao(r.duracaoS);
  if (r.modo === 'a-pe') return { valor: formatarDistancia(r.distanciaM), detalhe: `${tempo} a pé` };
  const atraso = r.atrasoTransitoS ?? 0;
  return {
    valor: formatarDistancia(r.distanciaM),
    detalhe:
      atraso >= ATRASO_RELEVANTE_S
        ? `${tempo} de carro agora, +${formatarDuracao(atraso)} de trânsito`
        : `${tempo} de carro${r.atrasoTransitoS === null ? '' : ' agora'}`,
  };
}

/** Atribuição exigida pela fonte da rota. */
export function atribuicaoDaRota(r: Pick<RotaResponse, 'fonte'>): string {
  return r.fonte === 'tomtom' ? '© TomTom' : 'Rota: OSRM · © OpenStreetMap';
}
