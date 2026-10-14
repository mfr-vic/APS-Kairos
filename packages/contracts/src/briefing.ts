import { z } from 'zod';
import { AddressSchema, BusLineSchema, RailLineSchema } from './geo.js';
import { DateTimeSchema, DimensionSchema, ObservationSchema } from './envelope.js';

// Trajeto enviado pelo app (RF01–RF03)
export const TrajetoRequestSchema = z.object({
  origem: AddressSchema,
  destino: AddressSchema,
  // RF02: um ponto de ônibus e até 3 linhas
  onibus: BusLineSchema.array()
    .max(3)
    .default([])
    .refine((linhas) => new Set(linhas.map((l) => l.codigoParada)).size <= 1, {
      message: 'todas as linhas devem usar o mesmo ponto (codigoParada)',
    }),
  trilhos: RailLineSchema.array()
    .max(10)
    .default([])
    .refine((linhas) => new Set(linhas).size === linhas.length, { message: 'linhas repetidas' }),
});

export type TrajetoRequest = z.infer<typeof TrajetoRequestSchema>;

export const BriefingRequestSchema = z.object({
  trajeto: TrajetoRequestSchema,
});

export type BriefingRequest = z.infer<typeof BriefingRequestSchema>;

// Verdict enum (RF11 / RN08)
export const VerdictSchema = z.enum(['FAVORAVEL', 'ATENCAO', 'AGUARDAR', 'INDETERMINADO']);
export type Verdict = z.infer<typeof VerdictSchema>;

// Severidade de um motivo; INFORMATIVO não altera o veredito (RN04)
export const SeveritySchema = z.enum(['INFORMATIVO', 'ATENCAO', 'AGUARDAR']);
export type Severity = z.infer<typeof SeveritySchema>;

// Reason for verdict
export const ReasonSchema = z.object({
  dimensao: DimensionSchema,
  severidade: SeveritySchema,
  regra: z.string().regex(/^RN(0[1-9]|1[0-9])$/), // RN09 = trânsito (RF22, 14/10/2026)
  texto: z.string().min(1),
});

export type Reason = z.infer<typeof ReasonSchema>;

// Confidence level (RF13, C1–C3)
export const ConfidenceLevelSchema = z.enum(['ALTA', 'MEDIA', 'BAIXA']);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

export const ConfidenceSchema = z.object({
  nivel: ConfidenceLevelSchema,
  explicacao: z.string(),
});

export type Confidence = z.infer<typeof ConfidenceSchema>;

// Weather window (RF14): primeira hora cheia favorável nas próximas 6 h, ou null
export const WeatherWindowSchema = z
  .object({
    inicio: DateTimeSchema,
    fim: DateTimeSchema,
  })
  .nullable();

export type WeatherWindow = z.infer<typeof WeatherWindowSchema>;

// Route geometry (RF24); coordenadas em [lon, lat], como no GeoJSON.
// Ordem de fontes desde 14/10/2026: TomTom (com trânsito) → OSRM → linha reta. A linha reta só serve para a
// consulta de alagamento por raio; o app NÃO a apresenta como rota nem como distância de deslocamento.
export const GeometrySchema = z.object({
  fonte: z.enum(['tomtom', 'osrm', 'linha-reta']),
  coordenadas: z.array(z.tuple([z.number(), z.number()])).optional(),
  distanciaM: z.number().min(0).optional(), // comprimento da rota calculada (ausente na linha reta)
});

export type Geometry = z.infer<typeof GeometrySchema>;

// Response schema
export const BriefingResponseSchema = z.object({
  briefingId: z.string().uuid(),
  geradoEm: DateTimeSchema,
  veredito: VerdictSchema,
  motivos: ReasonSchema.array(),
  janelaMeteorologica: WeatherWindowSchema,
  confianca: ConfidenceSchema,
  observacoes: ObservationSchema.array(),
  geometria: GeometrySchema,
  atribuicoes: z.array(z.string()),
});

export type BriefingResponse = z.infer<typeof BriefingResponseSchema>;
