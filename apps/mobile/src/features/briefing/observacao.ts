// Acesso tipado às observações do briefing por dimensão (função pura).
import type { BriefingResponse, Dimension, Observation } from '@kairos/contracts';

export type ObservacaoDe<D extends Dimension> = Extract<Observation, { dimension: D }>;

export function observacao<D extends Dimension>(
  briefing: BriefingResponse | undefined,
  dimension: D
): ObservacaoDe<D> | undefined {
  return briefing?.observacoes.find((o): o is ObservacaoDe<D> => o.dimension === dimension);
}
