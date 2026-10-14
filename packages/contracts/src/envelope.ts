import { z } from 'zod';
import { CodigoLinhaSchema, CodigoParadaSchema, RailLineSchema } from './geo.js';

// ISO 8601 com fuso: aceita "Z" e "-03:00" (horários em America/Sao_Paulo, RNF13)
export const DateTimeSchema = z.string().datetime({ offset: true });

// Data state: fresh (≤ TTL), stale (> TTL, ≤ 3×TTL), unavailable
export const DataStateSchema = z.enum(['fresh', 'stale', 'unavailable']);
export type DataState = z.infer<typeof DataStateSchema>;

// Dimensões do briefing (RF06–RF10; `traffic` = RF22, reaberto em 14/10/2026 com o TomTom)
export const DimensionSchema = z.enum(['weather', 'air', 'bus', 'rail', 'flood', 'traffic']);
export type Dimension = z.infer<typeof DimensionSchema>;

// --- Valores por dimensão (formatos baseados nos spikes T03, T04, T06 e T07) ---

// RF06: clima atual + previsão horária das próximas 6 h (Open-Meteo Forecast)
export const WeatherHourSchema = z.object({
  hora: DateTimeSchema,
  precipitacaoMm: z.number().min(0),
  probabilidadePrecipitacao: z.number().int().min(0).max(100).nullable(),
  temperaturaC: z.number(),
});

export const WeatherValueSchema = z.object({
  atual: z.object({
    temperaturaC: z.number(),
    precipitacaoMm: z.number().min(0),
    ventoKmH: z.number().min(0).nullable(), // rajada não; velocidade a 10 m (Open-Meteo wind_speed_10m)
    codigoTempo: z.number().int().min(0).max(99).nullable(), // WMO weather_code (0 céu limpo … 99 tempestade com granizo)
    sensacaoC: z.number().nullable(), // apparent_temperature
    umidadePct: z.number().min(0).max(100).nullable(), // relative_humidity_2m
    uv: z.number().min(0).nullable(), // uv_index
  }),
  // Extremos do dia corrente (daily temperature_2m_max/min); null se a fonte não informar
  hoje: z.object({ temperaturaMaxC: z.number(), temperaturaMinC: z.number() }).nullable(),
  // Nascer e pôr do sol do dia corrente em America/Sao_Paulo; null se a fonte não informar
  sol: z.object({ nascer: DateTimeSchema, por: DateTimeSchema }).nullable(),
  horas: WeatherHourSchema.array().max(7),
});

export type WeatherValue = z.infer<typeof WeatherValueSchema>;

// RF07: qualidade do ar (Open-Meteo Air Quality / CAMS) — sempre estimativa de modelo
export const AirQualityBandSchema = z.enum(['BOA', 'MODERADA', 'RUIM', 'MUITO_RUIM', 'PESSIMA']);
export type AirQualityBand = z.infer<typeof AirQualityBandSchema>;

export const AirValueSchema = z.object({
  pm25: z.number().min(0), // µg/m³, valor da hora
  pm25Media24h: z.number().min(0).nullable(), // µg/m³; base da RN05 e da faixa (B.8); null sem 24 h de dados
  indice: z.number().int().min(0),
  escalaIndice: z.enum(['US_AQI', 'EUROPEAN_AQI']),
  faixa: AirQualityBandSchema.nullable(), // calculada de pm25Media24h (B.8); null se a média for null
  estimativaDeModelo: z.literal(true),
});

export type AirValue = z.infer<typeof AirValueSchema>;

// RF08: próxima chegada por linha vinculada (Olho Vivo /Previsao)
export const BusArrivalSchema = z.object({
  codigoLinha: CodigoLinhaSchema,
  letreiro: z.string().min(1),
  proximaChegada: DateTimeSchema.nullable(), // null = sem previsão (RN07)
  minutosAteChegada: z.number().int().min(0).nullable(),
  veiculos: z.number().int().min(0),
});

export const BusValueSchema = z.object({
  codigoParada: CodigoParadaSchema,
  nomeParada: z.string().nullable(),
  linhas: BusArrivalSchema.array(),
});

export type BusValue = z.infer<typeof BusValueSchema>;

// RF09/RF21: status por linha. Vocabulário visto no spike T05 (13/10/2026): "Operação Normal",
// "Maiores Intervalos", "Operação Encerrada"; a doc da ARTESP cita também "Velocidade reduzida"
export const RailSituationSchema = z.enum(['NORMAL', 'ALTERADA', 'PARALISADA', 'DESCONHECIDA']);
export type RailSituation = z.infer<typeof RailSituationSchema>;

export const RailValueSchema = z.object({
  linhas: z
    .object({
      linha: RailLineSchema,
      statusTexto: z.string(), // texto original da fonte, ex.: "Operação Normal"
      situacao: RailSituationSchema, // normalização usada pela RN06
      // Explicação da fonte quando houver (ARTESP `descricao`, ex.: trecho com maiores intervalos); null se vazia
      detalhe: z.string().min(1).nullable(),
      // Fonte desta linha: um trajeto pode misturar ARTESP (4–9) e a página do Metrô (1, 2, 3, 15)
      fonte: z.string().min(1),
    })
    .array(),
});

export type RailValue = z.infer<typeof RailValueSchema>;

// RF10: pontos históricos de alagamento próximos ao trajeto (GeoSampa → PostGIS)
export const FloodValueSchema = z.object({
  raioM: z.number().positive(),
  pontos: z
    .object({
      sourceId: z.string(), // ex.: "geosampa:alagamento:1458"
      distanciaM: z.number().min(0),
      ocorridoEm: z.string().date().nullable(),
      local: z.string().nullable(), // a fonte não tem endereço; hoje é a subprefeitura
    })
    .array(),
});

export type FloodValue = z.infer<typeof FloodValueSchema>;

// RF22 (reaberto em 14/10/2026): trânsito no trajeto pela TomTom Routing API com tráfego ao vivo
export const TrafficLevelSchema = z.enum(['LIVRE', 'MODERADO', 'INTENSO', 'PARADO']);
export type TrafficLevel = z.infer<typeof TrafficLevelSchema>;

export const TrafficValueSchema = z.object({
  distanciaM: z.number().min(0), // comprimento do trajeto de carro/ônibus pela rota calculada
  duracaoLivreS: z.number().int().min(0), // tempo sem trânsito (noTrafficTravelTimeInSeconds)
  duracaoAtualS: z.number().int().min(0), // tempo com o trânsito de agora (travelTimeInSeconds)
  atrasoS: z.number().int().min(0), // trafficDelayInSeconds
  nivel: TrafficLevelSchema,
  // Trechos lentos da rota (seções `traffic` da TomTom), do maior atraso para o menor
  trechosLentos: z
    .object({
      atrasoS: z.number().int().min(0),
      comprimentoM: z.number().min(0),
      // magnitudeOfDelay da TomTom: 0 desconhecido, 1 leve, 2 moderado, 3 intenso, 4 indefinido (ex.: via fechada)
      magnitude: z.number().int().min(0).max(4),
    })
    .array(),
});

export type TrafficValue = z.infer<typeof TrafficValueSchema>;

// --- Envelope (RF12) ---

const envelopeBase = {
  source: z.string(), // e.g., "open-meteo", "sptrans-olhovivo", "artesp"
  status: DataStateSchema,
  observedAt: DateTimeSchema.nullable(), // null só quando nunca houve dado
  fetchedAt: DateTimeSchema.nullable(),
  ttlSeconds: z.number().int().positive(),
  motivo: z.string().optional(), // obrigatório quando status = unavailable
};

export const ObservationSchema = z
  .discriminatedUnion('dimension', [
    z.object({ dimension: z.literal('weather'), ...envelopeBase, value: WeatherValueSchema.nullable() }),
    z.object({ dimension: z.literal('air'), ...envelopeBase, value: AirValueSchema.nullable() }),
    z.object({ dimension: z.literal('bus'), ...envelopeBase, value: BusValueSchema.nullable() }),
    z.object({ dimension: z.literal('rail'), ...envelopeBase, value: RailValueSchema.nullable() }),
    z.object({ dimension: z.literal('flood'), ...envelopeBase, value: FloodValueSchema.nullable() }),
    z.object({ dimension: z.literal('traffic'), ...envelopeBase, value: TrafficValueSchema.nullable() }),
  ])
  .superRefine((obs, ctx) => {
    if (obs.status === 'unavailable') {
      if (!obs.motivo) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['motivo'], message: 'obrigatório quando status = unavailable' });
      }
      return;
    }
    if (obs.value === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'obrigatório quando status ≠ unavailable' });
    }
    if (obs.observedAt === null || obs.fetchedAt === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['observedAt'], message: 'observedAt e fetchedAt obrigatórios quando status ≠ unavailable' });
    }
  });

export type Observation = z.infer<typeof ObservationSchema>;
