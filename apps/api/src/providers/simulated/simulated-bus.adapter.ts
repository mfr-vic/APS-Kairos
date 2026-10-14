// Ônibus simulado (T21, RF19): substitui a previsão do Olho Vivo (RF08) no modo demonstração.
import { BusLineSchema, CodigoLinhaSchema, CodigoParadaSchema, type BusValue } from '@kairos/contracts';
import { z } from 'zod';
import type { ParametrosOnibus } from './cenario-simulado.js';
import { PREFIXO_SIMULADO, SimulatedAdapter, isoSaoPaulo } from './simulated.adapter.js';

// Aceita a entrada do adaptador real ({ codigoParada, linhas }) ou o trajeto ({ onibus }); o resto é ignorado
const EntradaOnibusSchema = z.object({
  codigoParada: CodigoParadaSchema.optional(),
  linhas: z.object({ codigoLinha: CodigoLinhaSchema, letreiro: z.string().min(1) }).array().optional(),
  onibus: BusLineSchema.array().optional(),
});

/** Linha e parada usadas quando a entrada não traz nenhuma (códigos do spike T04). */
export const LINHA_ONIBUS_PADRAO = { codigoLinha: 609, letreiro: '875A-10' } as const;
export const PARADA_PADRAO = 260016861;

function entradaOnibus(input: unknown) {
  const parsed = EntradaOnibusSchema.safeParse(input);
  const entrada = parsed.success ? parsed.data : {};
  const linhas = entrada.linhas ?? entrada.onibus ?? [];
  return {
    codigoParada: entrada.codigoParada ?? entrada.onibus?.[0]?.codigoParada ?? PARADA_PADRAO,
    linhas:
      linhas.length > 0
        ? linhas.map((l) => ({ codigoLinha: l.codigoLinha, letreiro: l.letreiro }))
        : [LINHA_ONIBUS_PADRAO],
  };
}

export class SimulatedBusAdapter extends SimulatedAdapter<'bus'> {
  readonly dimension = 'bus' as const;
  readonly source = `${PREFIXO_SIMULADO}sptrans-olhovivo`;
  readonly ttlSeconds = 30; // igual ao real (C.5)
  protected readonly padrao: ParametrosOnibus = { minutosAteChegada: 6 };
  protected readonly campoObrigatorio = 'linhas';

  protected chaveDaEntrada(input: unknown): string {
    const { codigoParada, linhas } = entradaOnibus(input);
    return `${codigoParada}:${linhas.map((l) => l.codigoLinha).join(',')}`;
  }

  // Toda linha pedida recebe a mesma previsão do cenário (a RN07 olha cada linha vinculada)
  protected montarValor(params: ParametrosOnibus, input: unknown, observadoMs: number): BusValue {
    const { codigoParada, linhas } = entradaOnibus(input);
    const minutos = params.minutosAteChegada;
    return {
      codigoParada,
      nomeParada: 'Parada simulada (demonstração)',
      linhas: linhas.map((l) => ({
        codigoLinha: l.codigoLinha,
        letreiro: l.letreiro,
        proximaChegada: minutos === null ? null : isoSaoPaulo(observadoMs + minutos * 60_000),
        minutosAteChegada: minutos,
        veiculos: minutos === null ? 0 : 1,
      })),
    };
  }
}
