// Cores do Καιρός: UMA fonte de verdade. Identidade de 11/10/2026 (paleta do usuário):
//   #0F261F estrutura (cabeçalhos, marca, fundo do tema escuro)
//   #730F1F tensão (AGUARDAR, alertas críticos, erros)
//   #B5D1CC decisão (ação principal, seleção, FAVORÁVEL)
// Pares claro/escuro em hex (sem Material You): a marca é a mesma em qualquer aparelho.
// Contrastes AA (≥ 4,5:1) medidos por script em 11/10/2026 (tabela no relatório da redesign);
// atenção: #730F1F sobre #0F261F NÃO tem contraste — nunca texto de uma sobre a outra.
import type { RailLine } from '@kairos/contracts';

import { useEsquema } from './tema-provider';

const claro = {
  /** Fundo das telas (listas agrupadas ficam em `surface` por cima dele). */
  background: '#EEF4F1',
  surface: '#FFFFFF',
  /** Campos, chips não selecionados, botão secundário. */
  surfaceMuted: '#DFE9E5',
  /** Linha pressionada. */
  surfacePressed: '#CFDED8',
  separator: '#C2D2CC',
  text: '#0F261F',
  textSecondary: '#44584F',
  /** Verde da marca como texto/ícone sobre superfícies (links, ícones ativos). */
  tint: '#1F5748',
  /** Cabeçalhos de marca (abas e stack). */
  brand: '#0F261F',
  onBrand: '#FFFFFF',
  onBrandSecondary: '#B5D1CC',
  /** Cor de decisão: chamada principal ("Novo trajeto", "Salvar"), seleção. */
  accent: '#B5D1CC',
  onAccent: '#0F261F',
  danger: '#730F1F',
  /** Texto sobre `danger` (selo da aba Alertas). */
  onDanger: '#FFFFFF',
  /** Estado como ícone/ponto sobre superfície (sempre ao lado de texto). */
  fgOk: '#1F6B4E',
  fgAtencao: '#7A4E10',
  fgErro: '#8C1424',
  fgNeutro: '#51635B',
  /** Fundos suaves por tom (bloco do ícone, pílula, faixa de aviso). Texto por cima: fg* ou text. */
  okSoft: '#DCEFE6',
  atencaoSoft: '#F6E8D2',
  erroSoft: '#F6DDE1',
  neutroSoft: '#E1E9E6',
  /** Realce de decisão (melhor janela na faixa horária, item selecionado na folha). */
  decisaoSoft: '#D6E8E3',
  /** Snackbar: superfície invertida + ação (Desfazer) na cor de decisão. */
  inverseSurface: '#0F261F',
  onInverse: '#FFFFFF',
  inverseAction: '#B5D1CC',
};

export type Palette = { [K in keyof typeof claro]: string };

const escuro: Palette = {
  background: '#0F261F',
  surface: '#17332A',
  surfaceMuted: '#204236',
  surfacePressed: '#294F41',
  separator: '#2E5245',
  text: '#E9F2EF',
  textSecondary: '#A3BDB5',
  tint: '#B5D1CC',
  brand: '#0A1B16',
  onBrand: '#FFFFFF',
  onBrandSecondary: '#A3BDB5',
  accent: '#B5D1CC',
  onAccent: '#0F261F',
  danger: '#F0A4AC',
  onDanger: '#0F261F',
  fgOk: '#86C8AC',
  fgAtencao: '#E3B06E',
  fgErro: '#F0A4AC',
  fgNeutro: '#A3BDB5',
  okSoft: '#1C4436',
  atencaoSoft: '#45361C',
  erroSoft: '#4A262D',
  neutroSoft: '#243F35',
  decisaoSoft: '#22463C',
  inverseSurface: '#E9F2EF',
  onInverse: '#0F261F',
  inverseAction: '#1F5748',
};

export const palettes = { light: claro, dark: escuro } as const;

/** Paleta do tema atual (preferência do app ou sistema). Só dentro de componentes. */
export function useColors(): Palette {
  return useEsquema() === 'dark' ? escuro : claro;
}

/**
 * Cores de veredito/estado: fundos sólidos com texto branco, iguais nos dois temas
 * (contraste medido ≥ 6,3:1 com branco). Nunca usadas sozinhas: sempre com ícone e texto.
 */
export const statusColors = {
  favoravel: '#1F6B4E',
  atencao: '#7A4E10',
  aguardar: '#730F1F',
  indeterminado: '#51635B',
  onStatus: '#FFFFFF',
} as const;

/**
 * Tom = UMA escala de estado para o app inteiro (veredito, alertas, faixa horária, selos, ações):
 *   ok      → Favorável · "siga" · nível 0 sem risco
 *   atencao → Atenção · chuva moderada · alerta nível 1–2
 *   erro    → Aguardar · chuva forte · alerta crítico (nível 3)
 *   neutro  → Indeterminado · informativo · sem dado
 * Nunca só a cor: sempre com ícone e texto.
 */
export type Tom = 'ok' | 'atencao' | 'erro' | 'neutro';

const SOLIDO: Record<Tom, string> = {
  ok: statusColors.favoravel,
  atencao: statusColors.atencao,
  erro: statusColors.aguardar,
  neutro: statusColors.indeterminado,
};

/** Cores de um tom no tema atual: `fg` (texto/ícone sobre surface), `suave` (fundo), `solido` (texto onStatus). */
export function coresDoTom(c: Palette, tom: Tom): { fg: string; suave: string; solido: string } {
  switch (tom) {
    case 'ok':
      return { fg: c.fgOk, suave: c.okSoft, solido: SOLIDO.ok };
    case 'atencao':
      return { fg: c.fgAtencao, suave: c.atencaoSoft, solido: SOLIDO.atencao };
    case 'erro':
      return { fg: c.fgErro, suave: c.erroSoft, solido: SOLIDO.erro };
    case 'neutro':
      return { fg: c.fgNeutro, suave: c.neutroSoft, solido: SOLIDO.neutro };
  }
}

/** Contorno das pílulas sobre a faixa do veredito (texto branco por cima continua ≥ 6,3:1). */
export const contornoSobreStatus = 'rgba(255, 255, 255, 0.45)';

/**
 * Cores de identificação das linhas de trilho (identidade oficial, NÃO seguem a paleta do app;
 * conferir no manual do Metrô/ARTESP antes da entrega). `on` é a cor do número sobre a bolinha.
 */
export const lineColors: Partial<Record<RailLine, { bg: string; on: string }>> = {
  L1: { bg: '#0455A1', on: '#FFFFFF' },
  L2: { bg: '#007E5E', on: '#FFFFFF' },
  L3: { bg: '#EE372F', on: '#FFFFFF' },
  L4: { bg: '#FED304', on: '#111827' },
  L5: { bg: '#9B3894', on: '#FFFFFF' },
  // 6–9 entram no seletor com a ARTESP (13/10/2026); tons conferidos pelo usuário em 13/10 contra a
  // identificação das linhas: Laranja, Rubi (vermelho escuro/vinho), Diamante (cinza/prata claro), Esmeralda.
  L6: { bg: '#F68D1E', on: '#111827' }, // Laranja
  L7: { bg: '#9E1766', on: '#FFFFFF' }, // Rubi
  L8: { bg: '#9EA09D', on: '#111827' }, // Diamante (próximo da L15 Prata: o número na bolinha diferencia)
  L9: { bg: '#00A99D', on: '#111827' }, // Esmeralda
  L15: { bg: '#9EA2A8', on: '#111827' },
};

/** Linha sem cor conhecida (10–13): cinza neutro. */
export const lineColorFallback = { bg: '#51635B', on: '#FFFFFF' } as const;
