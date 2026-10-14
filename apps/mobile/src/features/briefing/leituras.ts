// Leituras derivadas do briefing (funções puras, sem tela): chegadas de ônibus relativas a
// "agora", pico de chuva no horizonte das regras, alagamento mais próximo, tempo relativo.
import type { BusValue, FloodValue, WeatherValue } from '@kairos/contracts';

import type { Tom } from '@/theme';

import { CHUVA_FORTE_MM, CHUVA_MODERADA_MM, HORIZONTE_CHUVA_H } from './limiares';

export type Chegada = {
  codigoLinha: number;
  letreiro: string;
  /** ISO da próxima chegada, ou null (sem previsão). */
  horario: string | null;
  /** Minutos de agora até a chegada (negativo = já passou), ou null. */
  minutos: number | null;
  veiculos: number;
};

/** Linhas vinculadas ordenadas pela chegada mais próxima; sem previsão por último. */
export function chegadas(bus: BusValue, agora: number): Chegada[] {
  return bus.linhas
    .map((l) => ({
      codigoLinha: l.codigoLinha,
      letreiro: l.letreiro,
      horario: l.proximaChegada,
      minutos:
        l.proximaChegada !== null
          ? Math.round((Date.parse(l.proximaChegada) - agora) / 60_000)
          : null,
      veiculos: l.veiculos,
    }))
    .sort((a, b) => (a.minutos ?? Infinity) - (b.minutos ?? Infinity));
}

/** "em CAIO PRADO B/C" ou, sem nome na fonte, "no ponto 260016861". */
export function noPonto(bus: BusValue): string {
  return bus.nomeParada ? `em ${bus.nomeParada}` : `no ponto ${bus.codigoParada}`;
}

/** "agora", "em 1 min", "em 12 min", "em 1 h 05 min". */
export function emMinutos(min: number): string {
  if (min <= 0) return 'agora';
  if (min < 60) return `em ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `em ${h} h` : `em ${h} h ${String(m).padStart(2, '0')} min`;
}

type Hora = WeatherValue['horas'][number];

/** Horas da previsão que ainda terminam no futuro, na ordem. */
export function horasFuturas(clima: WeatherValue, agora: number): Hora[] {
  return clima.horas.filter((h) => Date.parse(h.hora) > agora);
}

export type PicoChuva = {
  mm: number;
  /** ISO da hora do pico, ou null quando o pico é a chuva de agora. */
  hora: string | null;
  probabilidade: number | null;
};

/** Pior chuva entre agora e as 2 horas seguintes (horizonte da RN01/RN02/RN03). */
export function picoDeChuva(clima: WeatherValue, agora: number): PicoChuva {
  const candidatos: PicoChuva[] = [
    { mm: clima.atual.precipitacaoMm, hora: null, probabilidade: null },
    ...horasFuturas(clima, agora)
      .slice(0, HORIZONTE_CHUVA_H)
      .map((h) => ({ mm: h.precipitacaoMm, hora: h.hora, probabilidade: h.probabilidadePrecipitacao })),
  ];
  return candidatos.reduce((a, b) => (b.mm > a.mm ? b : a));
}

/** Maior chance de chuva nas 2 horas seguintes, com a hora em que ocorre. */
export function maiorChanceDeChuva(
  clima: WeatherValue,
  agora: number
): { pct: number; hora: string } | null {
  let melhor: { pct: number; hora: string } | null = null;
  for (const h of horasFuturas(clima, agora).slice(0, HORIZONTE_CHUVA_H)) {
    const p = h.probabilidadePrecipitacao;
    if (p !== null && (melhor === null || p > melhor.pct)) melhor = { pct: p, hora: h.hora };
  }
  return melhor;
}

/** Tom da chuva pela escala da B.8: forte → erro, moderada → atencao, resto → ok. */
export function tomDaChuva(mm: number): Tom {
  if (mm > CHUVA_FORTE_MM) return 'erro';
  if (mm > CHUVA_MODERADA_MM) return 'atencao';
  return 'ok';
}

/** Distância (m, arredondada) do ponto histórico de alagamento mais próximo, ou null. */
export function alagamentoMaisProximo(flood: FloodValue): number | null {
  if (flood.pontos.length === 0) return null;
  return Math.round(Math.min(...flood.pontos.map((p) => p.distanciaM)));
}
