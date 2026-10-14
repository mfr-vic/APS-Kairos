import { onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';
import type { NetworkState } from 'expo-network';

/**
 * Online = conectado a alguma rede. Não usamos `isInternetReachable`: a API roda no notebook
 * da rede local (às vezes um hotspot sem internet), então "sem internet" não impede o briefing.
 * `undefined` (estado ainda desconhecido) conta como online, para não pausar consultas à toa.
 */
export function estaOnline(estado: Pick<NetworkState, 'isConnected'>): boolean {
  return estado.isConnected !== false;
}

// C.6: refaz as consultas pausadas quando a conexão volta (o onlineManager do TanStack
// Query não detecta rede sozinho no React Native).
onlineManager.setEventListener((setOnline) => {
  const assinatura = Network.addNetworkStateListener((estado) => setOnline(estaOnline(estado)));
  return () => assinatura.remove();
});
