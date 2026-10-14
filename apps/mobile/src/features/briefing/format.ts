import type {
  AirQualityBand,
  ConfidenceLevel,
  DataState,
  Dimension,
  RailSituation,
  Severity,
  Verdict,
} from '@kairos/contracts';
import { useEffect, useState } from 'react';

import type { IconName } from '@/components/icon';
import { statusColors, type Tom } from '@/theme';

// RNF13: horários em America/Sao_Paulo. São Paulo não tem horário de verão desde 2019,
// então o fuso é fixo em UTC−3; evitamos depender do suporte a timeZone do Intl no Hermes.
const OFFSET_SP_MS = -3 * 60 * 60 * 1000;

function doisDigitos(n: number) {
  return String(n).padStart(2, '0');
}

/** "08:05" no horário de São Paulo. */
export function horaSP(iso: string): string {
  const d = new Date(Date.parse(iso) + OFFSET_SP_MS);
  return `${doisDigitos(d.getUTCHours())}:${doisDigitos(d.getUTCMinutes())}`;
}

/** "10/10 08:05" no horário de São Paulo. */
export function dataHoraSP(iso: string): string {
  const d = new Date(Date.parse(iso) + OFFSET_SP_MS);
  return `${doisDigitos(d.getUTCDate())}/${doisDigitos(d.getUTCMonth() + 1)} ${horaSP(iso)}`;
}

/** "agora", "há 5 min", "há 2 h 10 min", "há 3 dias". */
export function haQuantoTempo(iso: string, agora: number): string {
  const min = Math.max(0, Math.floor((agora - Date.parse(iso)) / 60_000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 === 0 ? `há ${h} h` : `há ${h} h ${min % 60} min`;
  const dias = Math.floor(h / 24);
  return dias === 1 ? 'há 1 dia' : `há ${dias} dias`;
}

/** Relógio que avança a cada 30 s, para os textos "há N min" não congelarem na tela. */
export function useAgora(intervaloMs = 30_000): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), intervaloMs);
    return () => clearInterval(t);
  }, [intervaloMs]);
  return agora;
}

export function decimal(n: number, casas = 1): string {
  return n.toFixed(casas).replace('.', ',');
}

/** Hora "08:05" + "(há 3 min)" quando passou de 1 min: recência exata e relativa juntas. */
export function atualizadoAs(iso: string, agora: number): string {
  const rel = haQuantoTempo(iso, agora);
  return rel === 'agora' ? `atualizado às ${horaSP(iso)}` : `atualizado às ${horaSP(iso)} (${rel})`;
}

export const VEREDITO: Record<
  Verdict,
  { rotulo: string; resumo: string; cor: string; icone: IconName; tom: Tom }
> = {
  FAVORAVEL: {
    rotulo: 'Favorável',
    resumo: 'Nenhuma fonte indica risco para sair agora.',
    cor: statusColors.favoravel,
    icone: 'favoravel',
    tom: 'ok',
  },
  ATENCAO: {
    rotulo: 'Atenção',
    resumo: 'Dá para sair, com o cuidado indicado.',
    cor: statusColors.atencao,
    icone: 'atencao',
    tom: 'atencao',
  },
  AGUARDAR: {
    rotulo: 'Aguardar',
    resumo: 'Sair agora tem risco; espere a melhor janela.',
    cor: statusColors.aguardar,
    icone: 'aguardar',
    tom: 'erro',
  },
  INDETERMINADO: {
    rotulo: 'Indeterminado',
    resumo: 'Faltam dados para decidir.',
    cor: statusColors.indeterminado,
    icone: 'indeterminado',
    tom: 'neutro',
  },
};

export const SEVERIDADE: Record<Severity, { rotulo: string; icone: IconName }> = {
  INFORMATIVO: { rotulo: 'Informativo', icone: 'info' },
  ATENCAO: { rotulo: 'Atenção', icone: 'atencao' },
  AGUARDAR: { rotulo: 'Aguardar', icone: 'aguardar' },
};

export const CONFIANCA: Record<ConfidenceLevel, string> = {
  ALTA: 'Alta',
  MEDIA: 'Média',
  BAIXA: 'Baixa',
};

export const DIMENSAO: Record<Dimension, string> = {
  weather: 'Clima',
  air: 'Qualidade do ar',
  bus: 'Ônibus',
  rail: 'Trilhos',
  flood: 'Alagamento',
  traffic: 'Trânsito',
};

export const ESTADO_DADO: Record<DataState, string> = {
  fresh: 'atualizado',
  stale: 'desatualizado',
  unavailable: 'indisponível',
};

// Faixas do IQAr (MMA) sobre a média de 24 h de MP2,5 (B.8).
export const FAIXA_AR: Record<AirQualityBand, string> = {
  BOA: 'Boa',
  MODERADA: 'Moderada',
  RUIM: 'Ruim',
  MUITO_RUIM: 'Muito ruim',
  PESSIMA: 'Péssima',
};

export const SITUACAO_TRILHO: Record<RailSituation, string> = {
  NORMAL: 'Normal',
  ALTERADA: 'Alterada',
  PARALISADA: 'Paralisada',
  DESCONHECIDA: 'Desconhecida',
};
