// Construtor de briefings para testes: parte de uma fixture validada e troca só o necessário.
// Os resultados passam pelo BriefingResponseSchema, para nenhum teste usar dado fora do contrato.
import {
  BriefingResponseSchema,
  LINHAS_ARTESP,
  type BriefingResponse,
  type Observation,
  type RailValue,
} from '@kairos/contracts';

import { FIXTURES_BRIEFING } from '@/features/briefing/fixtures';

export const fixture = (veredito: BriefingResponse['veredito']) =>
  FIXTURES_BRIEFING.find((f) => f.briefing.veredito === veredito)!.briefing;

export const GERADO = '2026-10-10T08:08:00-03:00';
/** "Agora" dos testes: 2 min depois da geração das fixtures. */
export const AGORA = Date.parse('2026-10-10T08:10:00-03:00');

export function briefingCom(
  base: BriefingResponse,
  mudar: Partial<Omit<BriefingResponse, 'observacoes'>> & { observacoes?: Observation[] }
): BriefingResponse {
  return BriefingResponseSchema.parse({ ...base, ...mudar });
}

/** Troca (ou inclui) a observação da mesma dimensão. */
export function comObservacao(base: BriefingResponse, obs: Observation): BriefingResponse {
  const outras = base.observacoes.filter((o) => o.dimension !== obs.dimension);
  return briefingCom(base, { observacoes: [...outras, obs] });
}

export const onibus = (
  linhas: { letreiro: string; codigoLinha: number; proximaChegada: string | null; veiculos?: number }[],
  extra: Partial<Observation> = {}
): Observation =>
  ({
    dimension: 'bus',
    source: 'sptrans-olhovivo',
    status: 'fresh',
    observedAt: '2026-10-10T08:07:00-03:00',
    fetchedAt: '2026-10-10T08:07:06-03:00',
    ttlSeconds: 30,
    value: {
      codigoParada: 260016861,
      nomeParada: 'CAIO PRADO B/C',
      linhas: linhas.map((l) => ({
        codigoLinha: l.codigoLinha,
        letreiro: l.letreiro,
        proximaChegada: l.proximaChegada,
        minutosAteChegada: l.proximaChegada
          ? Math.round((Date.parse(l.proximaChegada) - Date.parse('2026-10-10T08:07:00-03:00')) / 60_000)
          : null,
        veiculos: l.veiculos ?? (l.proximaChegada ? 1 : 0),
      })),
    },
    ...extra,
  }) as Observation;

type LinhaTrilho = RailValue['linhas'][number];

/** Contrato 1.3.0: `fonte` por linha (padrão: 4–9 ARTESP, demais Metrô); `source` = fontes unidas por "+". */
export const trilhos = (
  linhas: (Pick<LinhaTrilho, 'linha' | 'situacao' | 'statusTexto'> & Partial<Pick<LinhaTrilho, 'detalhe' | 'fonte'>>)[]
): Observation => {
  const completas: LinhaTrilho[] = linhas.map((l) => ({
    detalhe: null,
    fonte: (LINHAS_ARTESP as readonly string[]).includes(l.linha) ? 'artesp' : 'metro-sp',
    ...l,
  }));
  return {
    dimension: 'rail',
    source: [...new Set(completas.map((l) => l.fonte))].sort().join('+'),
    status: 'fresh',
    observedAt: '2026-10-10T08:06:00-03:00',
    fetchedAt: '2026-10-10T08:07:57-03:00',
    ttlSeconds: 300,
    value: { linhas: completas },
  };
};

export const clima = (
  horas: { h: string; mm: number; p: number }[],
  atualMm = 0
): Observation => ({
  dimension: 'weather',
  source: 'open-meteo',
  status: 'fresh',
  observedAt: '2026-10-10T08:00:00-03:00',
  fetchedAt: '2026-10-10T08:07:55-03:00',
  ttlSeconds: 900,
  value: {
    atual: {
      temperaturaC: 20,
      precipitacaoMm: atualMm,
      ventoKmH: 10,
      codigoTempo: 3,
      sensacaoC: 19,
      umidadePct: 80,
      uv: 1,
    },
    hoje: null,
    sol: null,
    horas: horas.map(({ h, mm, p }) => ({
      hora: `2026-10-10T${h}:00:00-03:00`,
      precipitacaoMm: mm,
      probabilidadePrecipitacao: p,
      temperaturaC: 20,
    })),
  },
});
