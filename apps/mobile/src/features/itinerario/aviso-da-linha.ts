// Linhas em implantação: a lista de estações vem da fonte oficial (ARTESP), mas parte delas pode ainda
// não estar aberta. Decisão do usuário (14/10/2026): manter a lista e avisar, em vez de esconder a linha.
// A L6 aparece "Operação Encerrada" à tarde na ARTESP (spike T05) e todas as suas coordenadas no GeoSampa
// são de projeto; o texto não cita estações específicas porque isso não foi confirmado em fonte oficial.
import type { RailLine } from '@kairos/contracts';

export type AvisoDaLinha = { titulo: string; texto: string };

const AVISOS: Partial<Record<RailLine, AvisoDaLinha>> = {
  L6: {
    titulo: 'Linha em implantação',
    texto:
      'A lista de estações é a da ARTESP, mas algumas podem ainda estar em obras ou fechadas ao público. ' +
      'Confirme nos canais oficiais da Linha Uni antes de sair.',
  },
};

export function avisoDaLinha(linha: RailLine): AvisoDaLinha | null {
  return AVISOS[linha] ?? null;
}
