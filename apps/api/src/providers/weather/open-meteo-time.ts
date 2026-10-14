// Horários da Open-Meteo (T17, RNF13). Com `timezone=America/Sao_Paulo`, a API devolve `time` em hora
// local SEM fuso ("2026-10-10T08:00") e informa o deslocamento em `utc_offset_seconds` (-10800).
// Usado pelos adaptadores de clima e de qualidade do ar.
import { z } from 'zod';

export const OPEN_METEO_TIMEZONE = 'America/Sao_Paulo';

/** "AAAA-MM-DDTHH:MM" (formato `iso8601` da Open-Meteo, sem segundos e sem fuso). */
export const OpenMeteoLocalTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'hora local AAAA-MM-DDTHH:MM');

/** Deslocamento em segundos (múltiplo de 15 min, como em qualquer fuso real). */
export const UtcOffsetSecondsSchema = z
  .number()
  .int()
  .refine((s) => s % 900 === 0 && Math.abs(s) <= 14 * 3600, 'deslocamento de fuso inválido');

function deslocamentoIso(offsetSeconds: number): string {
  const sinal = offsetSeconds < 0 ? '-' : '+';
  const total = Math.abs(offsetSeconds) / 60;
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${sinal}${hh}:${mm}`;
}

/** "2026-10-10T08:00" + (-10800) → "2026-10-10T08:00:00-03:00". */
export function openMeteoTimeToIso(horaLocal: string, offsetSeconds: number): string {
  return `${horaLocal}:00${deslocamentoIso(offsetSeconds)}`;
}

/** Início da hora cheia: "2026-10-10T08:15" → "2026-10-10T08:00". */
export function inicioDaHora(horaLocal: string): string {
  return `${horaLocal.slice(0, 14)}00`;
}

/**
 * `observedAt` de `current` (C.5, opção B de 10/10/2026): fim do intervalo da fonte (`current.interval`,
 * 900 s no clima e 3600 s no ar), limitado a `agoraMs`. Com o início do intervalo, o dado horário do ar
 * passava de 1 h (TTL) e ficava `stale` mesmo recém-buscado.
 */
export function fimDoIntervaloIso(horaLocal: string, offsetSeconds: number, intervalSeconds: number, agoraMs: number): string {
  const fimMs = Math.min(Date.parse(openMeteoTimeToIso(horaLocal, offsetSeconds)) + intervalSeconds * 1000, agoraMs);
  return `${new Date(fimMs + offsetSeconds * 1000).toISOString().slice(0, 19)}${deslocamentoIso(offsetSeconds)}`;
}
