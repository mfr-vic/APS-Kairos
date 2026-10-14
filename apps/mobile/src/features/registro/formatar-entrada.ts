// Texto de uma linha do Registro de requisições (função pura; testada em test/features/registro).
import type { Dimension } from '@kairos/contracts';

import { DIMENSAO } from '@/features/briefing/format';
import type { EntradaRegistro } from '@/shared/api/registro';

const ERRO: Record<NonNullable<EntradaRegistro['erro']>, string> = {
  http: 'erro HTTP',
  rede: 'sem conexão',
  'tempo-esgotado': 'tempo esgotado',
  contrato: 'fora do contrato',
  cancelada: 'cancelada',
};

/** "08:05:31" em São Paulo (UTC−3 fixo, como features/briefing/format.ts). */
export function horaComSegundosSP(epochMs: number): string {
  const d = new Date(epochMs - 3 * 60 * 60 * 1000);
  const dd = (n: number) => String(n).padStart(2, '0');
  return `${dd(d.getUTCHours())}:${dd(d.getUTCMinutes())}:${dd(d.getUTCSeconds())}`;
}

/** "812 B", "4,1 kB". */
export function tamanho(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1).replace('.', ',')} kB`;
}

const nomeDim = (d: string) => (DIMENSAO[d as Dimension] ?? d).toLowerCase();

/** Título ("POST /v1/briefings · HTTP 200") e detalhe ("1083 ms · 4,1 kB · ônibus indisponível"). */
export function formatarEntrada(e: EntradaRegistro): { titulo: string; detalhe: string } {
  const resultado = [e.status === null ? null : `HTTP ${e.status}`, e.erro && e.erro !== 'http' ? ERRO[e.erro] : null]
    .filter(Boolean)
    .join(' · ');
  const partes = [`${e.latenciaMs} ms`];
  if (e.bytes !== null) partes.push(tamanho(e.bytes));
  if (e.degradadas) {
    const { stale, unavailable } = e.degradadas;
    if (stale.length === 0 && unavailable.length === 0) partes.push('todas as dimensões atuais');
    if (stale.length > 0) partes.push(`desatualizado: ${stale.map(nomeDim).join(', ')}`);
    if (unavailable.length > 0) partes.push(`indisponível: ${unavailable.map(nomeDim).join(', ')}`);
  }
  return { titulo: `${e.metodo} ${e.rota} · ${resultado}`, detalhe: partes.join(' · ') };
}
