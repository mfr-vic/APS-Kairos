import { z } from 'zod';

// Common error codes
export const ErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'PROVIDER_UNAVAILABLE',
  'TIMEOUT',
  'CIRCUIT_BREAKER_OPEN',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'INTERNAL_ERROR',
]);

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

// RFC 9457 Problem Details (Content-Type: application/problem+json)
export const ProblemDetailsSchema = z.object({
  type: z.string().default('about:blank'), // URI reference
  title: z.string(), // em pt-BR: o app mostra este texto ao usuário
  status: z.number().int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  // extensões
  code: ErrorCodeSchema.optional(),
  errors: z
    .object({
      path: z.string(),
      message: z.string(),
    })
    .array()
    .optional(),
});

export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;
