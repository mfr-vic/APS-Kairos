import { z } from 'zod';

// Geographic coordinates (WGS84)
export const LatLonSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

export type LatLon = z.infer<typeof LatLonSchema>;

// Address with optional label (e.g., "Casa", "Faculdade")
export const AddressSchema = LatLonSchema.extend({
  rotulo: z.string().trim().min(1).max(60).optional().default('Sem rótulo'),
});

export type Address = z.infer<typeof AddressSchema>;

// Olho Vivo: códigos inteiros (spike T04: cl=609, cp=260016861)
export const CodigoLinhaSchema = z.number().int().positive();
export const CodigoParadaSchema = z.number().int().positive();

// Linha de ônibus vinculada ao trajeto (RF02)
export const BusLineSchema = z.object({
  codigoLinha: CodigoLinhaSchema,
  letreiro: z.string().min(1), // e.g., "875A-10"
  codigoParada: CodigoParadaSchema,
});

export type BusLine = z.infer<typeof BusLineSchema>;

// Rail line codes
export const RailLineSchema = z.enum([
  'L1',
  'L2',
  'L3',
  'L4',
  'L5',
  'L6',
  'L7',
  'L8',
  'L9',
  'L10',
  'L11',
  'L12',
  'L13',
  'L15',
]);

export type RailLine = z.infer<typeof RailLineSchema>;

// RF03: linhas cobertas pela API Trilhos da ARTESP desde 03/09/2026
export const LINHAS_ARTESP = ['L4', 'L5', 'L6', 'L7', 'L8', 'L9'] as const satisfies readonly RailLine[];

// RF21 (go parcial ampliado, 10/10/2026): linhas lidas da página Direto do Metrô; ARTESP tem precedência em 4/5
export const LINHAS_METRO_RF21 = ['L1', 'L2', 'L3', 'L4', 'L5', 'L15'] as const satisfies readonly RailLine[];
