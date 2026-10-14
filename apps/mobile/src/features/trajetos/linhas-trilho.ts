import type { RailLine, RailLinesResponse } from '@kairos/contracts';

export type OpcaoLinhaTrilho = RailLinesResponse['linhas'][number];

/**
 * RF03: fallback local do RailPicker quando `GET /v1/transit/rail/lines` não responde e não há
 * lista em cache. Linhas com fonte desde a chave ARTESP (13/10/2026): 1, 2, 3 e 15 pela página
 * Direto do Metrô; 4–9 pela ARTESP, com as operadoras como a API Trilhos as nomeia
 * (`empresas[].nome`, spikes/artesp/fixture-concessionarias.json). CPTM (10–13) segue sem fonte.
 * Se o servidor mudar, a lista da API vence.
 */
export const LINHAS_TRILHO_LOCAL: readonly OpcaoLinhaTrilho[] = [
  { linha: 'L1', nome: 'Azul', operadora: 'Metrô' },
  { linha: 'L2', nome: 'Verde', operadora: 'Metrô' },
  { linha: 'L3', nome: 'Vermelha', operadora: 'Metrô' },
  { linha: 'L4', nome: 'Amarela', operadora: 'ViaQuatro' },
  { linha: 'L5', nome: 'Lilás', operadora: 'ViaMobilidade 5' },
  { linha: 'L6', nome: 'Laranja', operadora: 'Linha Uni' },
  { linha: 'L7', nome: 'Rubi', operadora: 'TIC Trens' },
  { linha: 'L8', nome: 'Diamante', operadora: 'ViaMobilidade 8 e 9' },
  { linha: 'L9', nome: 'Esmeralda', operadora: 'ViaMobilidade 8 e 9' },
  { linha: 'L15', nome: 'Prata', operadora: 'Metrô' },
];

const CPTM: readonly RailLine[] = ['L10', 'L11', 'L12', 'L13'];

/** "Linha 4-Amarela" */
export function rotuloLinhaTrilho({
  linha,
  nome,
}: Pick<OpcaoLinhaTrilho, 'linha' | 'nome'>): string {
  return `Linha ${linha.slice(1)}-${nome}`;
}

export function nomeLinhaTrilho(linha: RailLine): string {
  const op = LINHAS_TRILHO_LOCAL.find((l) => l.linha === linha);
  return op ? rotuloLinhaTrilho(op) : `Linha ${linha.slice(1)}`;
}

/** Quem opera a linha ("ViaQuatro", "Metrô", "CPTM"); null se desconhecida. */
export function operadoraLinhaTrilho(linha: RailLine): string | null {
  if (CPTM.includes(linha)) return 'CPTM';
  return LINHAS_TRILHO_LOCAL.find((l) => l.linha === linha)?.operadora ?? null;
}

/** "nos canais oficiais do Metrô" / "da ViaMobilidade 8 e 9" — para conselhos de confirmação. */
export function canaisOficiais(linha: RailLine): string {
  const op = operadoraLinhaTrilho(linha);
  if (!op) return 'nos canais oficiais da operadora';
  return `nos canais oficiais ${op === 'Metrô' ? 'do' : 'da'} ${op}`;
}
