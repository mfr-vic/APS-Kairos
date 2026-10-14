// Aquecimento no boot (defeito de 13/10/2026): logo que a API sobe, faz UMA consulta legítima por fonte
// (clima e ar no centro de SP, página do Metrô, uma consulta de alagamento no PostGIS) pelo runner, com
// prazo generoso e fora de qualquer requisição. Abre a conexão (DNS + TCP + TLS, ou o pool do banco) e já
// deixa o cache preenchido; falha só vira log.
import type { ProviderLogger, ProviderRunner } from './provider-runner.js';
import type { Provider } from './provider.js';
import { toProviderError } from './errors.js';

export interface AlvoAquecimento {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: Provider<any, unknown>;
  input: unknown;
}

export const AQUECIMENTO_TIMEOUT_MS = 15_000;

/** Aquece todas as fontes em paralelo. Nunca lança; resolve quando todas terminarem (ou estourarem). */
export async function aquecerConexoes(
  runner: Pick<ProviderRunner, 'refresh'>,
  alvos: readonly AlvoAquecimento[],
  opts: { logger: ProviderLogger; timeoutMs?: number; signal?: AbortSignal },
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? AQUECIMENTO_TIMEOUT_MS;
  await Promise.all(
    alvos.map(async ({ provider, input }) => {
      const inicio = performance.now();
      try {
        await runner.refresh(provider, input, { timeoutMs, signal: opts.signal });
        opts.logger.info({ provider: provider.source, latencyMs: Math.round(performance.now() - inicio) }, 'aquecimento');
      } catch (err) {
        const erro = toProviderError(err);
        opts.logger.warn(
          { provider: provider.source, erro: erro.kind, mensagem: erro.message, latencyMs: Math.round(performance.now() - inicio) },
          'aquecimento falhou',
        );
      }
    }),
  );
}
