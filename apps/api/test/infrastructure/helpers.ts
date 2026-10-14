// Apoio aos testes da infraestrutura (T16): relógio simulado e logger que guarda as linhas
import type { FetchFn } from '../../src/infrastructure/http-client.js';
import type { Clock } from '../../src/infrastructure/clock.js';
import type { ProviderLogger } from '../../src/infrastructure/provider-runner.js';

export class FakeClock implements Clock {
  constructor(private current = Date.parse('2026-10-10T12:00:00Z')) {}
  now(): number {
    return this.current;
  }
  advance(ms: number): void {
    this.current += ms;
  }
}

export interface LogLine {
  level: 'info' | 'warn';
  obj: Record<string, unknown>;
  msg?: string;
}

export function memoryLogger(): ProviderLogger & { lines: LogLine[] } {
  const lines: LogLine[] = [];
  return {
    lines,
    info: (obj, msg) => lines.push({ level: 'info', obj: obj as Record<string, unknown>, msg }),
    warn: (obj, msg) => lines.push({ level: 'warn', obj: obj as Record<string, unknown>, msg }),
  };
}

/** Response JSON para o fetch falso. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** fetch que nunca responde, mas rejeita quando o signal é abortado (como o fetch real). */
export function hangingFetch(): FetchFn {
  return (_input, init) =>
    new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    });
}
