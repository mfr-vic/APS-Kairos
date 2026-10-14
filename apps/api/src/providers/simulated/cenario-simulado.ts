// Tipos do cenário simulado (T21, RF19): o que cada provedor simulado faz no cenário ativo.
// O catálogo de cenários nomeados fica em modules/demo/cenarios.ts.
import type { Dimension, RailSituation } from '@kairos/contracts';

/** Comportamento de uma dimensão num cenário. `P` = parâmetros do valor normal da dimensão. */
export type Comportamento<P> =
  /** Valor válido montado com os parâmetros; `idadeSegundos` recua o observedAt (TC15). */
  | ({ tipo: 'valor'; idadeSegundos?: number } & Partial<P>)
  /** Responde o valor normal só depois de `ms` (TC13: 10 s > timeout de 3 s). Respeita o signal. */
  | { tipo: 'atraso'; ms: number }
  /** Fonte fora do ar: HTTP `httpStatus` (padrão 503). Conta como falha no breaker (TC12, TC18). */
  | { tipo: 'falha'; httpStatus?: number }
  /** Corpo que não é JSON válido (TC14): mesmo erro do http-client (InvalidJsonError). */
  | { tipo: 'json-malformado' }
  /** JSON válido sem um campo obrigatório (TC14): o runner rejeita no schema do contrato. */
  | { tipo: 'campo-faltando' };

export interface ParametrosClima {
  /** Precipitação (mm/h) das próximas horas cheias, a partir da primeira hora cheia após o observedAt. */
  chuvaMmH: number[];
  temperaturaC: number;
}

export interface ParametrosAr {
  /** µg/m³; a faixa é calculada daqui (B.8). */
  pm25Media24h: number;
  /** µg/m³, valor da hora. */
  pm25: number;
  /** Índice exibido (US AQI); valor ilustrativo do cenário. */
  indice: number;
}

export interface ParametrosOnibus {
  /** Minutos até a próxima chegada de cada linha pedida; null = sem previsão (RN07). */
  minutosAteChegada: number | null;
}

export interface ParametrosTrilhos {
  /** Situação aplicada à PRIMEIRA linha da resposta; as demais ficam NORMAL. */
  situacaoPrimeiraLinha: RailSituation;
  statusTextoPrimeiraLinha: string;
  /** Explicação da fonte para a primeira linha (ARTESP `descricao`); ausente = null. */
  detalhePrimeiraLinha?: string | null;
}

export interface ParametrosAlagamento {
  /** Distância (m) de cada ponto simulado ao trajeto. */
  distanciasM: number[];
}

export interface ParametrosTransito {
  /** Tempo sem trânsito (s) do trajeto simulado. */
  duracaoLivreS: number;
  /** Atraso por trânsito (s); o nível sai da razão (livre + atraso) / livre (B.8). */
  atrasoS: number;
}

export interface ParametrosPorDimensao {
  weather: ParametrosClima;
  air: ParametrosAr;
  bus: ParametrosOnibus;
  rail: ParametrosTrilhos;
  flood: ParametrosAlagamento;
  traffic: ParametrosTransito;
}

/** Comportamento por dimensão; dimensão ausente = valor normal. */
export type CenarioSimulado = { [D in Dimension]?: Comportamento<ParametrosPorDimensao[D]> };

/** Porta lida pelos simulados; implementada pelo estado do cenário ativo (modules/demo/cenario-ativo.ts). */
export interface FonteDeCenario {
  /** Identifica o cenário ativo (nome + versão); entra na chave de cache para a troca valer na hora. */
  chave(): string;
  /** Simulação do cenário ativo; `null` = cenário `real` (os simulados devolvem o valor normal). */
  simulacao(): CenarioSimulado | null;
}
