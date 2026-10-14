// Apoio aos testes da T34: HTML real salvo e fixture sintética derivada dele
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** HTML REAL da página, coletado com uma requisição em 10/10/2026 às 21:02:05 (SP) = 2026-10-11T00:02:05Z. */
export const HTML_REAL = readFileSync(
  fileURLToPath(new URL('./fixtures/direto-metro-2026-10-10.html', import.meta.url)),
  'utf8',
);

/** Instante da coleta da fixture, para o relógio simulado. */
export const COLETADO_EM = Date.parse('2026-10-11T00:02:05Z');

/** Fixture SINTÉTICA: troca a situação de uma linha no HTML real (o spike não observou falhas). */
export function comSituacao(html: string, numero: string, situacao: string): string {
  const re = new RegExp(
    `(<div class="linha-numero"[^>]*>${numero}</div>\\s*<div class="linha-nome">[^<]*</div>\\s*<div class="linha-situacao" title=")[^"]*(">)[^<]*(</div>)`,
  );
  const novo = html.replace(re, `$1${situacao}$2${situacao}$3`);
  if (novo === html) throw new Error(`linha ${numero} não encontrada na fixture`);
  return novo;
}
