// Tendência de chuva nas próximas 3 h: compara a hora corrente (horas[0]) com a de +3 h
// (horas[3]) em WeatherValue.horas. Função pura; com menos de 4 horas na série, null.
import type { WeatherValue } from '@kairos/contracts';

import type { IconName } from '@/components/icon';

export type Tendencia = 'aumentando' | 'diminuindo' | 'estavel';

/** Diferença de precipitação (mm/h) a partir da qual a tendência deixa de ser "estável". */
export const LIMIAR_TENDENCIA_MM = 0.5;

type Hora = Pick<WeatherValue['horas'][number], 'precipitacaoMm'>;

export function tendenciaChuva(horas: readonly Hora[]): Tendencia | null {
  if (horas.length < 4) return null;
  const delta = horas[3].precipitacaoMm - horas[0].precipitacaoMm;
  if (delta >= LIMIAR_TENDENCIA_MM) return 'aumentando';
  if (delta <= -LIMIAR_TENDENCIA_MM) return 'diminuindo';
  return 'estavel';
}

export const TENDENCIA: Record<Tendencia, { rotulo: string; icone: IconName }> = {
  aumentando: { rotulo: 'chuva aumentando nas próximas 3 h', icone: 'tendenciaSobe' },
  diminuindo: { rotulo: 'chuva diminuindo nas próximas 3 h', icone: 'tendenciaDesce' },
  estavel: { rotulo: 'chuva estável nas próximas 3 h', icone: 'tendenciaEstavel' },
};
