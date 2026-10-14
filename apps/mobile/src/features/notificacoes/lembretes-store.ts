// RF25: preferências dos lembretes de saída, só no aparelho (AsyncStorage; nada vai ao servidor).
// `ativo` = interruptor geral de Sobre; `porTrajeto[id]` existe só para trajeto com lembrete ligado
// (opt-in, desligado por padrão). Como trajeto-store.ts, recebe o armazenamento (testável sem RN).
import { z } from 'zod';

import type { ArmazenamentoChaveValor } from '@/features/trajetos/trajeto-store';

export const CHAVE_LEMBRETES = 'kairos:lembretes:v1';

const HorarioSchema = z.object({
  hora: z.number().int().min(0).max(23),
  minuto: z.number().int().min(0).max(59),
});

const LembreteSchema = HorarioSchema.extend({
  /** habitual = derivado do uso (10 min antes); manual = escolhido pela pessoa. */
  origem: z.enum(['habitual', 'manual']),
  /** Horário habitual medido quando o lembrete foi ligado (fixo: não "anda" com os toques no lembrete). */
  habitual: HorarioSchema.nullable(),
});

const LembretesSchema = z.object({
  ativo: z.boolean(),
  porTrajeto: z.record(z.string(), LembreteSchema),
});

export type Lembrete = z.infer<typeof LembreteSchema>;
export type Lembretes = z.infer<typeof LembretesSchema>;

export const LEMBRETES_PADRAO: Lembretes = { ativo: true, porTrajeto: {} };

export function criarLembretesStore(armazenamento: ArmazenamentoChaveValor) {
  async function ler(): Promise<Lembretes> {
    try {
      const bruto = await armazenamento.getItem(CHAVE_LEMBRETES);
      const r = bruto ? LembretesSchema.safeParse(JSON.parse(bruto)) : null;
      return r?.success ? r.data : LEMBRETES_PADRAO;
    } catch {
      // Preferência corrompida: volta ao padrão (nenhum lembrete) em vez de travar a tela.
      return LEMBRETES_PADRAO;
    }
  }

  async function alterar(fn: (atual: Lembretes) => Lembretes): Promise<Lembretes> {
    const novo = fn(await ler());
    await armazenamento.setItem(CHAVE_LEMBRETES, JSON.stringify(novo));
    return novo;
  }

  return {
    ler,
    definirGeral: (ativo: boolean) => alterar((l) => ({ ...l, ativo })),
    /** Liga ou ajusta o lembrete de `id`; `ligarGeral` também liga o interruptor geral. */
    definir: (id: string, lembrete: Lembrete, ligarGeral = false) =>
      alterar((l) => ({ ativo: l.ativo || ligarGeral, porTrajeto: { ...l.porTrajeto, [id]: lembrete } })),
    remover: (id: string) =>
      alterar((l) => {
        const { [id]: _removido, ...resto } = l.porTrajeto;
        return { ...l, porTrajeto: resto };
      }),
  };
}

export type LembretesStore = ReturnType<typeof criarLembretesStore>;
