// Registro LOCAL de uso dos trajetos, que alimenta a hierarquia da lista (ordenar-trajetos.ts).
// "Uso" = abrir o briefing de um trajeto. Guarda só, por id de trajeto, os instantes das últimas
// aberturas: nada de posição, endereço ou conteúdo, e nada vai ao servidor (RNF14 / LGPD,
// minimização). Como trajeto-store.ts, não importa React Native: recebe o armazenamento.
import { z } from 'zod';

import type { ArmazenamentoChaveValor } from './trajeto-store';

export const CHAVE_USO_TRAJETOS = 'kairos:uso-trajetos:v1';

/** id do trajeto → instantes (ms desde a época) das aberturas, do mais antigo ao mais novo. */
export type UsoTrajetos = Record<string, number[]>;

const UsoSchema = z.record(z.string(), z.array(z.number().int().nonnegative()));

/** Duas aberturas do mesmo trajeto em menos de 30 min contam uma vez (voltar e reabrir não infla). */
export const INTERVALO_MINIMO_MS = 30 * 60_000;
/** Teto por trajeto: com meia-vida de 14 dias, usos além destes quase não pesam. */
export const MAX_USOS_POR_TRAJETO = 40;
/** Usos mais velhos que isto são apagados (peso < 0,3 % e minimização de dados). */
export const RETENCAO_MS = 120 * 24 * 3_600_000;

/**
 * Função pura: devolve o registro com um uso a mais de `id` em `quando`, aplicando o intervalo
 * mínimo, o teto e a retenção. Com `idsValidos`, apaga o histórico de trajetos que não existem mais.
 */
export function comUso(
  uso: UsoTrajetos,
  id: string,
  quando: number,
  idsValidos?: readonly string[]
): UsoTrajetos {
  const corte = quando - RETENCAO_MS;
  const validos = idsValidos ? new Set([...idsValidos, id]) : null;
  const novo: UsoTrajetos = {};
  for (const [chave, instantes] of Object.entries(uso)) {
    if (validos && !validos.has(chave)) continue;
    const recentes = instantes.filter((t) => t >= corte);
    if (recentes.length) novo[chave] = recentes;
  }
  const lista = novo[id] ?? [];
  const ultimo = lista[lista.length - 1];
  if (ultimo !== undefined && Math.abs(quando - ultimo) < INTERVALO_MINIMO_MS) {
    novo[id] = lista;
    return novo;
  }
  novo[id] = [...lista, quando].sort((a, b) => a - b).slice(-MAX_USOS_POR_TRAJETO);
  return novo;
}

export function criarUsoStore(armazenamento: ArmazenamentoChaveValor, agora: () => Date = () => new Date()) {
  async function ler(): Promise<UsoTrajetos> {
    const bruto = await armazenamento.getItem(CHAVE_USO_TRAJETOS);
    if (!bruto) return {};
    try {
      const r = UsoSchema.safeParse(JSON.parse(bruto));
      // Histórico corrompido não pode derrubar a lista: só a ordem volta ao padrão.
      return r.success ? r.data : {};
    } catch {
      return {};
    }
  }

  return {
    ler,

    /** Registra a abertura do briefing de `id`. Devolve o registro gravado. */
    async registrar(id: string, idsValidos?: readonly string[]): Promise<UsoTrajetos> {
      const novo = comUso(await ler(), id, agora().getTime(), idsValidos);
      await armazenamento.setItem(CHAVE_USO_TRAJETOS, JSON.stringify(novo));
      return novo;
    },

    /** Apaga todo o histórico de uso (a ordem volta a ser: favoritos, depois ordem de cadastro). */
    async limpar(): Promise<void> {
      await armazenamento.setItem(CHAVE_USO_TRAJETOS, JSON.stringify({}));
    },
  };
}

export type UsoStore = ReturnType<typeof criarUsoStore>;
