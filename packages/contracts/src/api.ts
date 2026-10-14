import { z } from 'zod';
import { CodigoLinhaSchema, CodigoParadaSchema, LatLonSchema, RailLineSchema } from './geo.js';
import { DataStateSchema, DateTimeSchema } from './envelope.js';

// GET /v1/health
export const HealthSchema = z.object({
  status: z.literal('up'),
  timestamp: DateTimeSchema,
});

export type Health = z.infer<typeof HealthSchema>;

// GET /v1/health/providers (RF18)
export const ProviderStatusSchema = z.enum(['ok', 'degradado', 'indisponivel', 'desconhecido']);
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>;

export const ProviderHealthSchema = z.object({
  name: z.string(),
  status: ProviderStatusSchema,
  latencyMs: z.number().int().min(0).nullable(), // última latência medida
  lastSuccessAt: DateTimeSchema.nullable(),
  // Contadores desde que a API subiu (observabilidade, RF18)
  requestCount: z.number().int().min(0),
  successCount: z.number().int().min(0),
  avgLatencyMs: z.number().int().min(0).nullable(), // média das requisições com sucesso
});

export const ProvidersHealthResponseSchema = z.object({
  providers: ProviderHealthSchema.array(),
});

export type ProvidersHealthResponse = z.infer<typeof ProvidersHealthResponseSchema>;

// GET /v1/geocode?q= (RF01)
export const GeocodeResponseSchema = z.object({
  resultados: LatLonSchema.extend({ rotulo: z.string() }).array(),
});

export type GeocodeResponse = z.infer<typeof GeocodeResponseSchema>;

// GET /v1/transit/bus/lines?q= (RF02)
export const BusLinesResponseSchema = z.object({
  linhas: z
    .object({
      codigoLinha: CodigoLinhaSchema,
      letreiro: z.string(),
      sentido: z.union([z.literal(1), z.literal(2)]),
      terminalPrincipal: z.string(),
      terminalSecundario: z.string(),
    })
    .array(),
});

export type BusLinesResponse = z.infer<typeof BusLinesResponseSchema>;

// GET /v1/transit/bus/stops?lineCode= (RF02)
export const BusStopsResponseSchema = z.object({
  paradas: LatLonSchema.extend({
    codigoParada: CodigoParadaSchema,
    nome: z.string(),
    endereco: z.string().nullable(),
  }).array(),
});

export type BusStopsResponse = z.infer<typeof BusStopsResponseSchema>;

// GET /v1/transit/rail/lines (RF03)
export const RailLinesResponseSchema = z.object({
  linhas: z
    .object({
      linha: RailLineSchema,
      nome: z.string(),
      operadora: z.string(),
    })
    .array(),
});

export type RailLinesResponse = z.infer<typeof RailLinesResponseSchema>;

// GET /v1/mapa/camadas (RF23, 1.4.0): camadas filtráveis da aba Mapa.
// Impacto de cada valor no veredito, já calculado com os limiares da B.8 pelo servidor.
export const ImpactoMapaSchema = z.enum(['NAO_PESA', 'ATENCAO', 'AGUARDAR']);
export type ImpactoMapa = z.infer<typeof ImpactoMapaSchema>;

const camadaBase = {
  source: z.string(),
  status: DataStateSchema,
  observedAt: DateTimeSchema.nullable(),
  motivo: z.string().nullable(), // preenchido quando status ≠ fresh
};

export const MapaPontoAlagamentoSchema = LatLonSchema.extend({
  sourceId: z.string(),
  ocorridoEm: z.string().date().nullable(),
  local: z.string().nullable(), // hoje é a subprefeitura (a fonte não tem endereço)
});

export const MapaPontoClimaSchema = LatLonSchema.extend({
  regiao: z.string(),
  temperaturaC: z.number(), // agora (current)
  chuvaProximaHoraMm: z.number().min(0), // hora [H, H+1], carimbo H+1 (B.8)
  probabilidadeChuva: z.number().int().min(0).max(100).nullable(),
  impactoChuva: ImpactoMapaSchema, // > 2,5 ATENCAO (RN02); > 7,6 AGUARDAR (RN01)
});

export const MapaCamadasResponseSchema = z.object({
  limiares: z.object({
    chuvaAtencaoMmH: z.number(),
    chuvaAguardarMmH: z.number(),
    raioAlagamentoM: z.number(),
  }),
  alagamento: z.object({ ...camadaBase, pontos: MapaPontoAlagamentoSchema.array() }),
  clima: z.object({
    ...camadaBase,
    horaPrevista: DateTimeSchema.nullable(), // fim da hora prevista (carimbo H+1)
    pontos: MapaPontoClimaSchema.array(),
  }),
});

export type MapaPontoAlagamento = z.infer<typeof MapaPontoAlagamentoSchema>;
export type MapaPontoClima = z.infer<typeof MapaPontoClimaSchema>;
export type MapaCamadasResponse = z.infer<typeof MapaCamadasResponseSchema>;

// GET /v1/rota?de=lat,lon&para=lat,lon&modo=a-pe|carro (1.5.0): rota real entre dois pontos para a aba Mapa
// (você → origem a pé; origem → destino de carro/ônibus). TomTom; OSRM só para `carro` (o OSRM público
// não tem perfil a pé). Sem rota → 503 problem+json: o app NUNCA mostra distância em linha reta.
export const ModoRotaSchema = z.enum(['a-pe', 'carro']);
export type ModoRota = z.infer<typeof ModoRotaSchema>;

export const RotaResponseSchema = z.object({
  modo: ModoRotaSchema,
  fonte: z.enum(['tomtom', 'osrm']),
  distanciaM: z.number().min(0),
  duracaoS: z.number().int().min(0), // com o trânsito de agora quando a fonte informar
  atrasoTransitoS: z.number().int().min(0).nullable(), // só `carro` pela TomTom; null nos demais
  coordenadas: z.array(z.tuple([z.number(), z.number()])), // [lon, lat]
  observedAt: DateTimeSchema,
});

export type RotaResponse = z.infer<typeof RotaResponseSchema>;

// GET /v1/reports/summary?dias=7 (RF26, 1.6.0): agregados do histórico de briefings (`briefing_log`).
// Privacidade (RNF14): o servidor guarda só o hash do trajeto, nunca nomes nem coordenadas exatas.
export const ReportsSummaryResponseSchema = z.object({
  periodo: z.object({ inicio: DateTimeSchema, fim: DateTimeSchema, dias: z.number().int().min(1).max(90) }),
  totalBriefings: z.number().int().min(0),
  trajetosDistintos: z.number().int().min(0),
  vereditosPorDia: z
    .object({
      dia: z.string().date(), // AAAA-MM-DD em America/Sao_Paulo
      FAVORAVEL: z.number().int().min(0),
      ATENCAO: z.number().int().min(0),
      AGUARDAR: z.number().int().min(0),
      INDETERMINADO: z.number().int().min(0),
    })
    .array(),
  // Disponibilidade por provedor = (fresh + stale) / consultas, no período
  disponibilidadePorProvedor: z
    .object({
      provedor: z.string(),
      consultas: z.number().int().min(0),
      fresh: z.number().int().min(0),
      stale: z.number().int().min(0),
      unavailable: z.number().int().min(0),
      disponibilidadePct: z.number().min(0).max(100).nullable(), // null sem consultas
    })
    .array(),
  latenciaMs: z
    .object({ p50: z.number().int().min(0), p95: z.number().int().min(0), max: z.number().int().min(0) })
    .nullable(), // null sem briefings no período
});

export type ReportsSummaryResponse = z.infer<typeof ReportsSummaryResponseSchema>;
