// Trilhos simulados (T21, RF19): substituem a página Direto do Metrô (RF21) / ARTESP (RF09) na demonstração.
import { LINHAS_ARTESP, LINHAS_METRO_RF21, RailLineSchema, type RailLine, type RailValue } from '@kairos/contracts';
import { z } from 'zod';
import type { ParametrosTrilhos } from './cenario-simulado.js';
import { PREFIXO_SIMULADO, SimulatedAdapter } from './simulated.adapter.js';

// Aceita a entrada do adaptador real ({ linhas }) ou o trajeto ({ trilhos }); o resto é ignorado
const EntradaTrilhosSchema = z.object({
  linhas: RailLineSchema.array().optional(),
  trilhos: RailLineSchema.array().optional(),
});

/** Sem linhas na entrada, responde todas as que têm fonte (RF03). */
export const LINHAS_TRILHO_PADRAO: readonly RailLine[] = [
  ...new Set<RailLine>([...LINHAS_METRO_RF21, ...LINHAS_ARTESP]),
];

const ARTESP: ReadonlySet<RailLine> = new Set(LINHAS_ARTESP);

function linhasPedidas(input: unknown): readonly RailLine[] {
  const parsed = EntradaTrilhosSchema.safeParse(input);
  const linhas = parsed.success ? (parsed.data.linhas ?? parsed.data.trilhos ?? []) : [];
  return linhas.length > 0 ? linhas : LINHAS_TRILHO_PADRAO;
}

export class SimulatedRailAdapter extends SimulatedAdapter<'rail'> {
  readonly dimension = 'rail' as const;
  readonly source = `${PREFIXO_SIMULADO}metro-sp`;
  readonly ttlSeconds = 5 * 60; // igual ao Metrô (C.5)
  protected readonly padrao: ParametrosTrilhos = {
    situacaoPrimeiraLinha: 'NORMAL',
    statusTextoPrimeiraLinha: 'Operação Normal',
  };
  protected readonly campoObrigatorio = 'linhas';

  protected chaveDaEntrada(input: unknown): string {
    return linhasPedidas(input).join(',');
  }

  // A situação do cenário vale para a primeira linha pedida; as demais operam normalmente.
  // `fonte` imita a composição real com chave ARTESP: 4–9 da ARTESP, o resto da página do Metrô.
  protected montarValor(params: ParametrosTrilhos, input: unknown): RailValue {
    return {
      linhas: linhasPedidas(input).map((linha, i) => {
        const fonte = `${PREFIXO_SIMULADO}${ARTESP.has(linha) ? 'artesp' : 'metro-sp'}`;
        return i === 0
          ? {
              linha,
              statusTexto: params.statusTextoPrimeiraLinha,
              situacao: params.situacaoPrimeiraLinha,
              detalhe: params.detalhePrimeiraLinha ?? null,
              fonte,
            }
          : { linha, statusTexto: 'Operação Normal', situacao: 'NORMAL' as const, detalhe: null, fonte };
      }),
    };
  }
}
