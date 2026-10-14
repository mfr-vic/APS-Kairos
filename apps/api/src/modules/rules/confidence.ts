// Confiança do briefing (RF13, C1–C3 da B.8). T25.
// Função pura: usa o status já calculado de cada observação (fresh/stale/unavailable pelo TTL, C.5).
import type { Confidence, DataState, Dimension, Observation } from '@kairos/contracts';
import { observacaoDe } from './helpers.js';
import { dimensoesTransporteVinculadas, type TrajetoVinculos } from './verdict.js';

const NOME_DIMENSAO: Record<Dimension, string> = {
  weather: 'clima',
  air: 'qualidade do ar',
  bus: 'ônibus',
  rail: 'trilhos',
  flood: 'alagamentos',
  traffic: 'trânsito',
};

// Dimensões relevantes ao trajeto: weather, air e flood sempre; bus/rail se houver linha vinculada (B.8).
// traffic só com ônibus vinculado (14/10/2026): é o único caso em que a RN09 pesa no veredito; num trajeto
// só de trilhos (ou a pé) a falta da TomTom não deixa a decisão menos confiável, e sem TOMTOM_KEY a
// confiança desses trajetos não pode cair para MÉDIA por uma dimensão que não muda nada.
export function dimensoesRelevantes(trajeto: TrajetoVinculos): Dimension[] {
  const transporte = dimensoesTransporteVinculadas(trajeto);
  return [
    'weather',
    'air',
    ...(transporte.includes('bus') ? (['bus', 'traffic'] as const) : []),
    ...(transporte.includes('rail') ? (['rail'] as const) : []),
    'flood',
  ];
}

// Observação ausente ou sem valor conta como unavailable
function estadoDe(obs: Observation | undefined): DataState {
  if (!obs || obs.value === null) return 'unavailable';
  return obs.status;
}

// C1 ALTA: todas fresh. C2 MÉDIA: alguma stale ou exatamente uma unavailable.
// C3 BAIXA: duas ou mais unavailable, ou o clima unavailable.
export function calcularConfianca(observacoes: readonly Observation[], trajeto: TrajetoVinculos): Confidence {
  const estados = dimensoesRelevantes(trajeto).map((dimensao) => {
    const obs = observacaoDe(observacoes, dimensao);
    return { dimensao, estado: estadoDe(obs), motivo: obs?.motivo };
  });
  const indisponiveis = estados.filter((e) => e.estado === 'unavailable');
  const desatualizadas = estados.filter((e) => e.estado === 'stale');
  const climaIndisponivel = indisponiveis.some((e) => e.dimensao === 'weather');

  if (indisponiveis.length === 0 && desatualizadas.length === 0) {
    return { nivel: 'ALTA', explicacao: 'Todos os dados do trajeto estão atualizados' };
  }

  const partes: string[] = [];
  if (indisponiveis.length > 0) {
    const nomes = listaPtBr(indisponiveis.map((e) => NOME_DIMENSAO[e.dimensao]));
    // O motivo da fonte só entra quando há uma única dimensão indisponível, para o texto não ficar longo
    const unico = indisponiveis.length === 1 ? indisponiveis[0]?.motivo : undefined;
    partes.push(`Sem dados de ${nomes}${unico ? ` (${unico})` : ''}`);
  }
  if (desatualizadas.length > 0) {
    const nomes = listaPtBr(desatualizadas.map((e) => NOME_DIMENSAO[e.dimensao]));
    partes.push(`${partes.length > 0 ? 'dados' : 'Dados'} desatualizados de ${nomes}`);
  }
  const explicacao = partes.join('; ');

  if (climaIndisponivel || indisponiveis.length >= 2) return { nivel: 'BAIXA', explicacao };
  return { nivel: 'MEDIA', explicacao };
}

// ["a", "b", "c"] → "a, b e c"
function listaPtBr(itens: readonly string[]): string {
  if (itens.length <= 1) return itens.join('');
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}
