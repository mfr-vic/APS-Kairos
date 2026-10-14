// EXPO_PUBLIC_* vai para o bundle do app: nunca coloque chaves de provedores aqui.
import { useSyncExternalStore } from 'react';

/** Endereço gravado no build (padrão). A pessoa pode trocar em Estado das fontes → Servidor da API. */
export const API_URL_PADRAO = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

let atual = API_URL_PADRAO;
const ouvintes = new Set<() => void>();

/** Endereço efetivo: o personalizado (features/provedores/servidor-api.ts) ou o padrão. */
export function apiUrl(): string {
  return atual;
}

/** `null` volta ao padrão do build. */
export function definirApiUrl(url: string | null) {
  atual = url ?? API_URL_PADRAO;
  ouvintes.forEach((o) => o());
}

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

/** Para telas que montam URLs (tiles do mapa, rodapé de Provedores) e precisam re-renderizar na troca. */
export function useApiUrl(): string {
  return useSyncExternalStore(assinar, apiUrl, apiUrl);
}
