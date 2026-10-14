// Utilitários puros compartilhados pelas regras (T24/T25). Sem I/O e sem relógio.
import type {
  AirValue,
  BusValue,
  Dimension,
  FloodValue,
  Observation,
  RailValue,
  TrafficValue,
  WeatherValue,
} from '@kairos/contracts';

const HORA_MS = 60 * 60 * 1000;

// America/Sao_Paulo não tem horário de verão desde 2019: deslocamento fixo de -03:00 (RNF13)
const DESLOCAMENTO_SP_MS = -3 * HORA_MS;

export function horasEmMs(horas: number): number {
  return horas * HORA_MS;
}

export type ObservacaoDe<D extends Dimension> = Extract<Observation, { dimension: D }>;

interface ValorPorDimensao {
  weather: WeatherValue;
  air: AirValue;
  bus: BusValue;
  rail: RailValue;
  flood: FloodValue;
  traffic: TrafficValue;
}

// Primeira observação da dimensão; ausente = tratada como unavailable pelas regras
export function observacaoDe<D extends Dimension>(
  observacoes: readonly Observation[],
  dimensao: D,
): ObservacaoDe<D> | undefined {
  return observacoes.find((o): o is ObservacaoDe<D> => o.dimension === dimensao);
}

// Valor utilizável: fresh ou stale (stale continua sendo dado, B.8). unavailable → null
export function valorUtilizavel<D extends Dimension>(
  obs: ObservacaoDe<D> | undefined,
): ValorPorDimensao[D] | null {
  if (!obs || obs.status === 'unavailable' || obs.value === null) return null;
  return obs.value as ValorPorDimensao[D];
}

export function estaIndisponivel(obs: Observation | undefined): boolean {
  return !obs || obs.status === 'unavailable' || obs.value === null;
}

export interface HoraPrecipitacao {
  horaMs: number;
  precipitacaoMm: number;
}

// Valores horários com carimbo em (agora, agora + h], em ordem cronológica (convenção da B.8)
export function horasNoHorizonte(clima: WeatherValue, agora: Date, horizonteH: number): HoraPrecipitacao[] {
  const inicio = agora.getTime();
  const fim = inicio + horasEmMs(horizonteH);
  return clima.horas
    .map((h) => ({ horaMs: Date.parse(h.hora), precipitacaoMm: h.precipitacaoMm }))
    .filter((h) => Number.isFinite(h.horaMs) && h.horaMs > inicio && h.horaMs <= fim)
    .sort((a, b) => a.horaMs - b.horaMs);
}

// ISO 8601 com fuso -03:00, ex.: "2026-10-10T09:00:00-03:00"
export function isoSaoPaulo(ms: number): string {
  return new Date(ms + DESLOCAMENTO_SP_MS).toISOString().slice(0, 19) + '-03:00';
}

// "19h" ou "19h30" no horário de São Paulo
export function horaSaoPaulo(ms: number): string {
  const d = new Date(ms + DESLOCAMENTO_SP_MS);
  const min = d.getUTCMinutes();
  return `${d.getUTCHours()}h${min === 0 ? '' : String(min).padStart(2, '0')}`;
}

// Número em pt-BR com 1 casa decimal: 8.1 → "8,1"
export function decimalPtBr(valor: number): string {
  return valor.toFixed(1).replace('.', ',');
}
