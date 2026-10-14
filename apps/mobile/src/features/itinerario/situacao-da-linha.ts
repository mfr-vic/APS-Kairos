// Situação atual de uma linha lida do ÚLTIMO briefing em cache do trajeto (nenhuma requisição).
import type { BriefingResponse, RailLine, RailValue } from '@kairos/contracts';

export type SituacaoDaLinha = RailValue['linhas'][number] & {
  /** Hora da leitura da fonte (observedAt da observação de trilhos). */
  observadoEm: string | null;
};

export function situacaoDaLinha(
  briefing: BriefingResponse | undefined,
  linha: RailLine
): SituacaoDaLinha | null {
  const obs = briefing?.observacoes.find((o) => o.dimension === 'rail');
  if (!obs || obs.dimension !== 'rail' || !obs.value) return null;
  const l = obs.value.linhas.find((x) => x.linha === linha);
  return l ? { ...l, observadoEm: obs.observedAt } : null;
}
