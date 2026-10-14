// Movimento do Καιρός: funcional, discreto, 120–300 ms. Contínuo só o pulso em informação
// crítica (AGUARDAR) e o brilho do esqueleto enquanto algo carrega. Com movimento reduzido
// ativo, nada se desloca nem escala: os componentes checam useReducedMotion (reanimated) e
// as animações de layout usam ReduceMotion.System. A háptica NÃO segue o movimento reduzido
// (é outro sentido); ela tem preferência própria em shared/feedback-tatil.ts.
import { cubicBezier } from 'react-native-reanimated';

export const motion = {
  /** Retorno ao toque (pressionar botão, linha, cartão): começa no press-in, sem atraso. */
  toque: 120,
  /** Troca pequena de estado (chip, ícone). */
  fast: 150,
  /** Troca de estado (expandir seção, trocar conteúdo, troca de veredito). */
  base: 200,
  /** Superfícies que entram (seção, snackbar). */
  slow: 250,
  /** Distância da entrada das seções (px): curta, só para dar direção. */
  entradaY: 8,
  /** Escalonamento entre itens de uma lista que entra (30–80 ms, faixa usual de escalonamento). */
  escalonamento: 40,
  /** A partir deste item a lista entra junta (lista longa não vira "grande entrada"). */
  escalonamentoMaxItens: 6,
  /** Ciclo do brilho do esqueleto (lento de propósito: discreto, não chama atenção). */
  brilhoEsqueleto: 1400,
  /** Escala ao pressionar: botão 3 %, cartão 2 % (superfície maior, movimento menor). */
  escalaBotao: 0.97,
  escalaCartao: 0.98,
} as const;

/**
 * Molas (forma de Apple: duração percebida + amortecimento). Sem quique: nada aqui foi
 * arremessado pelo dedo, então `dampingRatio: 1` (quique só faz sentido com impulso).
 */
export const molas = {
  /** Superfície que entra (snackbar). */
  entrada: { duration: 300, dampingRatio: 1 },
} as const;

/**
 * Curvas (cubic-bezier): ease-out forte para entrar/sair,
 * ease-in-out para o que se move na tela. Nunca ease-in em UI.
 */
export const curvas = {
  saida: [0.23, 1, 0.32, 1],
  movimento: [0.77, 0, 0.175, 1],
} as const;

/**
 * As mesmas curvas para transições/animações CSS do Reanimated (que recusam a string
 * 'cubic-bezier(...)'). No Jest o mock não tem `cubicBezier`: cai na palavra-chave.
 */
export const curvasCss = {
  saida: typeof cubicBezier === 'function' ? cubicBezier(...curvas.saida) : 'ease-out',
  movimento: typeof cubicBezier === 'function' ? cubicBezier(...curvas.movimento) : 'ease-in-out',
} as const;
