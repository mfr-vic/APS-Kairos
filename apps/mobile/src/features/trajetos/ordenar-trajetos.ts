// Hierarquia dos trajetos (item 2 de 13/10). O Καιρός responde "sair agora?": o topo da lista
// deve ser o trajeto que a pessoa provavelmente vai fazer AGORA. Critério, em ordem:
//   1. favoritos explícitos (estrela) antes dos demais — escolha da pessoa vence o palpite;
//   2. "frecência" com afinidade de horário: cada abertura do briefing soma um peso que
//      decai com a idade (meia-vida de 14 dias, como a frecência do histórico do Firefox) e é
//      maior quando aconteceu perto deste horário, no mesmo tipo de dia (útil × fim de semana).
//      Deslocamento pendular repete trajetos em horários parecidos: às 7h sobe "Casa → Trabalho",
//      às 18h sobe "Trabalho → Casa", mesmo que um deles seja mais usado no total;
//   3. desempate estável: uso mais recente, depois a ordem de cadastro.
// Distância (mais longe/mais perto) não entra: não diz nada sobre qual trajeto será feito agora.
// Funções puras: recebem `agora`, sem relógio nem armazenamento.
import type { TrajetoSalvo } from './trajeto-store';
import type { UsoTrajetos } from './uso-trajetos';

const DIA_MS = 24 * 3_600_000;
/** São Paulo sem horário de verão desde 2019: UTC−3 fixo (o app é só para a cidade de SP). */
const FUSO_SP_MS = -3 * 3_600_000;

export const MEIA_VIDA_DIAS = 14;
/** Até 60 min de diferença no relógio, afinidade plena; cai a zero em 3 h. */
export const JANELA_PLENA_MIN = 60;
export const JANELA_MAXIMA_MIN = 180;
/** Peso de um uso fora do horário: conta, mas pouco (frequência pura não decide sozinha). */
export const PISO_AFINIDADE = 0.25;
/** Uso num tipo de dia diferente (útil × fim de semana) vale metade da afinidade. */
export const FATOR_OUTRO_TIPO_DE_DIA = 0.5;

function minutoDoDiaSP(ms: number): number {
  const local = new Date(ms + FUSO_SP_MS);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

function diaUtilSP(ms: number): boolean {
  const dia = new Date(ms + FUSO_SP_MS).getUTCDay();
  return dia >= 1 && dia <= 5;
}

/** Distância em minutos entre dois horários do dia, dando a volta na meia-noite. */
export function distanciaHorario(a: number, b: number): number {
  const d = Math.abs(minutoDoDiaSP(a) - minutoDoDiaSP(b));
  return Math.min(d, 1440 - d);
}

/** 0–1: quanto um uso em `quando` parece com o momento `agora` (relógio + tipo de dia). */
export function afinidadeHorario(quando: number, agora: number): number {
  const d = distanciaHorario(quando, agora);
  const relogio = Math.max(
    0,
    Math.min(1, (JANELA_MAXIMA_MIN - d) / (JANELA_MAXIMA_MIN - JANELA_PLENA_MIN))
  );
  return relogio * (diaUtilSP(quando) === diaUtilSP(agora) ? 1 : FATOR_OUTRO_TIPO_DE_DIA);
}

/** Pontuação de um trajeto: soma, por uso, de decaimento × (piso + afinidade). */
export function pontuacao(usos: readonly number[] | undefined, agora: number): number {
  if (!usos) return 0;
  let total = 0;
  for (const quando of usos) {
    const idadeDias = Math.max(0, agora - quando) / DIA_MS;
    total += 0.5 ** (idadeDias / MEIA_VIDA_DIAS) * (PISO_AFINIDADE + afinidadeHorario(quando, agora));
  }
  return total;
}

/**
 * Lista na ordem da hierarquia: favoritos primeiro; dentro de cada grupo, maior pontuação;
 * empate → uso mais recente → ordem original (estável). Não muda a lista recebida.
 */
export function ordenarTrajetos(
  lista: readonly TrajetoSalvo[],
  uso: UsoTrajetos,
  agora: number
): TrajetoSalvo[] {
  return lista
    .map((t, indice) => ({
      t,
      indice,
      favorito: t.favorito === true,
      pontos: pontuacao(uso[t.id], agora),
      ultimo: uso[t.id]?.length ? uso[t.id][uso[t.id].length - 1] : -Infinity,
    }))
    .sort(
      (a, b) =>
        Number(b.favorito) - Number(a.favorito) ||
        b.pontos - a.pontos ||
        b.ultimo - a.ultimo ||
        a.indice - b.indice
    )
    .map((x) => x.t);
}

/** Afinidade média mínima para dizer "você costuma abrir neste horário". */
const LIMIAR_HABITO = 0.5;
const MIN_USOS_HABITO = 2;

export type MotivoDestaque =
  | { tipo: 'fixado'; texto: string }
  | { tipo: 'habito'; texto: string }
  | { tipo: 'favorito'; texto: string }
  | { tipo: 'frequente'; texto: string }
  | { tipo: 'lista'; texto: string };

/**
 * Por que este trajeto está no topo da tela inicial (visibilidade do estado do sistema):
 * a pessoa precisa saber se foi ela que fixou ou se é um palpite que muda com o horário.
 */
export function motivoDestaque(t: TrajetoSalvo, uso: UsoTrajetos, agora: number): MotivoDestaque {
  if (t.principal) return { tipo: 'fixado', texto: 'Fixado por você no topo' };
  const usos = uso[t.id] ?? [];
  const parecidos = usos.filter((q) => afinidadeHorario(q, agora) >= LIMIAR_HABITO);
  if (parecidos.length >= MIN_USOS_HABITO) {
    return { tipo: 'habito', texto: 'Sugerido agora: você costuma abri-lo neste horário' };
  }
  if (t.favorito) {
    return {
      tipo: 'favorito',
      texto: usos.length > 0 ? 'Sugerido agora: seu favorito mais usado' : 'Primeiro dos seus favoritos',
    };
  }
  if (usos.length > 0) return { tipo: 'frequente', texto: 'Sugerido agora: o que você mais abre ultimamente' };
  return { tipo: 'lista', texto: 'Primeiro da lista: marque favoritos com a estrela' };
}
