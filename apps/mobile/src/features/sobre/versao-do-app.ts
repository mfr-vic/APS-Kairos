// Versão exibida na aba Sobre: número real do app.json + onde ele está rodando.
// No .apk (standalone) não aparece "(desenvolvimento)"; no Expo Go e em __DEV__, sim.
export type AmbienteExecucao = 'storeClient' | 'standalone' | 'bare' | string | undefined;

export function rotuloVersao(versao: string | undefined, ambiente: AmbienteExecucao, dev: boolean): string {
  const v = `Versão ${versao ?? 'desconhecida'}`;
  if (ambiente === 'storeClient') return `${v} · no Expo Go (desenvolvimento)`;
  if (dev) return `${v} · build de desenvolvimento`;
  return v;
}
