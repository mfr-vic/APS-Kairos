// Catálogo de cenários nomeados do modo demonstração (T21, RF19, TC24).
// Cada cenário diz o que cada provedor simulado faz (dimensão ausente = valor normal) e o
// resultado esperado pelas regras da B.8 para o TRAJETO_REFERENCIA. Os testes em
// test/modules/demo/cenarios.test.ts passam cada cenário por simulados → ProviderRunner → regras
// e conferem `esperado`; se um limiar da B.8 mudar, o teste acusa o cenário que deixou de valer.
import type { BusLine, ConfidenceLevel, DataState, Dimension, RailLine, Verdict } from '@kairos/contracts';
import { z } from 'zod';
import type { CenarioSimulado } from '../../providers/simulated/index.js';

export const NOMES_CENARIO = [
  'real',
  'normal',
  'chuva-forte',
  'chuva-moderada',
  'alagamento',
  'ar-ruim',
  'onibus-demorado',
  'trilho-paralisado',
  'trilho-intervalos',
  'transito-intenso',
  'sptrans-fora',
  'dados-obsoletos',
  'resposta-invalida',
  'clima-lento',
  'tudo-fora',
] as const;

export const NomeCenarioSchema = z.enum(NOMES_CENARIO);
export type NomeCenario = z.infer<typeof NomeCenarioSchema>;

/** Resultado esperado do briefing do TRAJETO_REFERENCIA neste cenário. */
export interface EsperadoCenario {
  veredito: Verdict;
  confianca: ConfidenceLevel;
  /** Regras dos motivos, na ordem do RulesEngine (AGUARDAR, ATENÇÃO, INFORMATIVO). */
  regras: string[];
  /** Estado de cada dimensão; dimensão omitida = fresh. */
  estados: Partial<Record<Dimension, DataState>>;
}

export interface Cenario {
  descricao: string;
  /** `null` = cenário `real`: o briefing usa os provedores reais. */
  simulacao: CenarioSimulado | null;
  /** `null` no `real` (depende das fontes de verdade). */
  esperado: EsperadoCenario | null;
}

/** Trajeto usado na demo e nos testes: 1 linha de ônibus (códigos do spike T04) e a Linha 1. */
export const TRAJETO_REFERENCIA: { onibus: BusLine[]; trilhos: RailLine[] } = {
  onibus: [{ codigoLinha: 609, letreiro: '875A-10', codigoParada: 260016861 }],
  trilhos: ['L1'],
};

const TODAS_FORA: CenarioSimulado = {
  weather: { tipo: 'falha' },
  air: { tipo: 'falha' },
  bus: { tipo: 'falha' },
  rail: { tipo: 'falha' },
  flood: { tipo: 'falha' },
  traffic: { tipo: 'falha' },
};

// Valores dos cenários são ilustrativos (dados simulados), escolhidos para cair nos limiares da B.8:
// chuva forte > 7,6 mm/h; moderada > 2,5; alagamento ≤ 300 m; MP2,5 24 h > 50 µg/m³; espera > 20 min.
export const CENARIOS: Record<NomeCenario, Cenario> = {
  real: {
    descricao: 'Sem simulação: o briefing usa os provedores reais',
    simulacao: null,
    esperado: null,
  },
  normal: {
    descricao: 'Tudo simulado e tranquilo: sem chuva, ar bom, ônibus em 6 min, linha normal',
    simulacao: {},
    esperado: { veredito: 'FAVORAVEL', confianca: 'ALTA', regras: [], estados: {} },
  },
  'chuva-forte': {
    descricao: 'Chuva forte na próxima hora (12 mm/h) → RN01',
    simulacao: { weather: { tipo: 'valor', chuvaMmH: [12, 9, 3] } },
    esperado: { veredito: 'AGUARDAR', confianca: 'ALTA', regras: ['RN01'], estados: {} },
  },
  'chuva-moderada': {
    descricao: 'Chuva moderada na próxima hora (5 mm/h) → RN02',
    simulacao: { weather: { tipo: 'valor', chuvaMmH: [5, 3, 1] } },
    esperado: { veredito: 'ATENCAO', confianca: 'ALTA', regras: ['RN02'], estados: {} },
  },
  alagamento: {
    descricao: 'Chuva moderada (4 mm/h) + pontos de alagamento a 120 m e 260 m → RN03 (e RN02)',
    simulacao: {
      weather: { tipo: 'valor', chuvaMmH: [4, 2] },
      flood: { tipo: 'valor', distanciasM: [120, 260] },
    },
    esperado: { veredito: 'AGUARDAR', confianca: 'ALTA', regras: ['RN03', 'RN02'], estados: {} },
  },
  'ar-ruim': {
    descricao: 'MP2,5 média de 24 h em 62 µg/m³ (faixa Ruim) → RN05',
    simulacao: { air: { tipo: 'valor', pm25Media24h: 62, pm25: 62, indice: 155 } },
    esperado: { veredito: 'ATENCAO', confianca: 'ALTA', regras: ['RN05'], estados: {} },
  },
  'onibus-demorado': {
    descricao: 'Próximo ônibus em 35 min → RN07',
    simulacao: { bus: { tipo: 'valor', minutosAteChegada: 35 } },
    esperado: { veredito: 'ATENCAO', confianca: 'ALTA', regras: ['RN07'], estados: {} },
  },
  'trilho-paralisado': {
    descricao: 'Primeira linha de trilho do trajeto paralisada → RN06',
    simulacao: {
      rail: {
        tipo: 'valor',
        situacaoPrimeiraLinha: 'PARALISADA',
        statusTextoPrimeiraLinha: 'Operação Paralisada',
      },
    },
    esperado: { veredito: 'AGUARDAR', confianca: 'ALTA', regras: ['RN06'], estados: {} },
  },
  'trilho-intervalos': {
    descricao: 'Primeira linha de trilho com "Maiores Intervalos" e explicação da fonte (atrasos e obstáculos) → RN06',
    simulacao: {
      rail: {
        tipo: 'valor',
        situacaoPrimeiraLinha: 'ALTERADA',
        statusTextoPrimeiraLinha: 'Maiores Intervalos',
        // Texto no formato da `descricao` da ARTESP (spike T05, 13/10/2026), adaptado à linha do trajeto
        detalhePrimeiraLinha:
          'Devido à atividade de manutenção programada, os trens circulam com maiores intervalos entre as estações Sé e Luz.',
      },
    },
    esperado: { veredito: 'ATENCAO', confianca: 'ALTA', regras: ['RN06'], estados: {} },
  },
  'transito-intenso': {
    descricao: 'Trânsito intenso no trajeto: 10 min de atraso sobre 14 min sem trânsito (nível INTENSO) → RN09 com ônibus',
    simulacao: { traffic: { tipo: 'valor', atrasoS: 10 * 60 } },
    esperado: { veredito: 'ATENCAO', confianca: 'ALTA', regras: ['RN09'], estados: {} },
  },
  'sptrans-fora': {
    descricao: 'Olho Vivo fora do ar (HTTP 503) → ônibus unavailable (TC12, TC18)',
    simulacao: { bus: { tipo: 'falha', httpStatus: 503 } },
    esperado: { veredito: 'FAVORAVEL', confianca: 'MEDIA', regras: [], estados: { bus: 'unavailable' } },
  },
  'dados-obsoletos': {
    descricao: 'Clima de 30 min atrás (TTL 15 min) e ônibus de 1 min atrás (TTL 30 s) → stale (TC15)',
    simulacao: {
      weather: { tipo: 'valor', idadeSegundos: 30 * 60 },
      bus: { tipo: 'valor', idadeSegundos: 60 },
    },
    esperado: {
      veredito: 'FAVORAVEL',
      confianca: 'MEDIA',
      regras: [],
      estados: { weather: 'stale', bus: 'stale' },
    },
  },
  'resposta-invalida': {
    descricao: 'Clima sem o campo "atual" e ar com JSON malformado → unavailable com log (TC14)',
    simulacao: { weather: { tipo: 'campo-faltando' }, air: { tipo: 'json-malformado' } },
    esperado: {
      veredito: 'FAVORAVEL',
      confianca: 'BAIXA',
      regras: [],
      estados: { weather: 'unavailable', air: 'unavailable' },
    },
  },
  'clima-lento': {
    descricao: 'Clima responde só depois de 10 s → timeout de 3 s, clima unavailable (TC13)',
    simulacao: { weather: { tipo: 'atraso', ms: 10_000 } },
    esperado: { veredito: 'FAVORAVEL', confianca: 'BAIXA', regras: [], estados: { weather: 'unavailable' } },
  },
  'tudo-fora': {
    descricao: 'Todas as fontes fora do ar → INDETERMINADO (RN08)',
    simulacao: TODAS_FORA,
    esperado: {
      veredito: 'INDETERMINADO',
      confianca: 'BAIXA',
      regras: [],
      estados: {
        weather: 'unavailable',
        air: 'unavailable',
        bus: 'unavailable',
        rail: 'unavailable',
        flood: 'unavailable',
        traffic: 'unavailable',
      },
    },
  },
};
