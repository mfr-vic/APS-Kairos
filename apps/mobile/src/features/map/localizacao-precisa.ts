// "Mostrar minha posição" da aba Mapa: pede a permissão e lê o GPS com precisão ALTA (o mapa dá zoom
// na pessoa). No Android 12+ e no iOS 14+ a pessoa pode conceder só a localização aproximada: aí a
// leitura segue (com precisão equilibrada) e o app avisa que a posição pode estar a alguns km.
import { LatLonSchema, type LatLon } from '@kairos/contracts';
import * as Location from 'expo-location';

import { PRAZO_GPS_MS } from '@/features/trajetos/obter-localizacao';

export type ResultadoPosicao =
  | { ok: true; ponto: LatLon; aproximada: boolean; precisaoM: number | null }
  | { ok: false; mensagem: string };

export const AVISO_APROXIMADA =
  'O app recebeu só a localização aproximada: a posição pode estar a alguns quilômetros. Para mais precisão, ative "Localização exata" nas permissões do Καιρός.';

export async function obterPosicaoPrecisa(prazoMs = PRAZO_GPS_MS): Promise<ResultadoPosicao> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) {
      return {
        ok: false,
        mensagem: 'Permissão de localização negada. Libere a localização nas configurações do aparelho para ver sua posição.',
      };
    }
    const aproximada = perm.android?.accuracy === 'coarse' || perm.ios?.accuracy === 'reduced';
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: aproximada ? Location.Accuracy.Balanced : Location.Accuracy.Highest,
      }),
      new Promise<never>((_, rejeitar) => {
        timer = setTimeout(() => rejeitar(new Error('prazo do GPS')), prazoMs);
      }),
    ]);
    const ponto = LatLonSchema.safeParse({ lat: pos.coords.latitude, lon: pos.coords.longitude });
    if (!ponto.success) return { ok: false, mensagem: 'O aparelho devolveu coordenadas inválidas.' };
    return { ok: true, ponto: ponto.data, aproximada, precisaoM: pos.coords.accuracy ?? null };
  } catch {
    return { ok: false, mensagem: 'Não foi possível obter a localização. Confira se o GPS está ligado.' };
  } finally {
    clearTimeout(timer);
  }
}
