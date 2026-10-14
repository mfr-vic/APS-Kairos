// RF01 / TC01: origem pelo GPS do aparelho (expo-location). Permissão negada não trava o cadastro:
// devolve uma mensagem pt-BR e o usuário segue pela busca de endereço.
import { LatLonSchema, type LatLon } from '@kairos/contracts';
import * as Location from 'expo-location';

export type ResultadoLocalizacao = { ok: true; ponto: LatLon } | { ok: false; mensagem: string };

/** Sem sinal de GPS a leitura pode demorar indefinidamente; desistimos depois disto. */
export const PRAZO_GPS_MS = 15_000;

export async function obterLocalizacao(prazoMs = PRAZO_GPS_MS): Promise<ResultadoLocalizacao> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return {
        ok: false,
        mensagem:
          'Permissão de localização negada. Busque o endereço ou libere a localização nas configurações do aparelho.',
      };
    }
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<never>((_, rejeitar) => {
        timer = setTimeout(() => rejeitar(new Error('prazo do GPS')), prazoMs);
      }),
    ]);
    const ponto = LatLonSchema.safeParse({ lat: pos.coords.latitude, lon: pos.coords.longitude });
    if (!ponto.success)
      return { ok: false, mensagem: 'O aparelho devolveu coordenadas inválidas.' };
    return { ok: true, ponto: ponto.data };
  } catch {
    return {
      ok: false,
      mensagem:
        'Não foi possível obter a localização. Confira se o GPS está ligado ou busque o endereço.',
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Localização SEM pedir permissão (widget do tempo, mapa): se já foi concedida,
 * devolve a última posição conhecida (ou a atual); senão (ou em erro), null.
 */
export async function obterLocalizacaoSePermitida(prazoMs = PRAZO_GPS_MS): Promise<LatLon | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { granted } = await Location.getForegroundPermissionsAsync();
    if (!granted) return null;
    const pos =
      (await Location.getLastKnownPositionAsync()) ??
      (await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<never>((_, rejeitar) => {
          timer = setTimeout(() => rejeitar(new Error('prazo do GPS')), prazoMs);
        }),
      ]));
    const ponto = LatLonSchema.safeParse({ lat: pos.coords.latitude, lon: pos.coords.longitude });
    return ponto.success ? ponto.data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
