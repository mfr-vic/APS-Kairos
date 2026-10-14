// Formato bruto das respostas do Olho Vivo v2.1 (T18), conforme as fixtures reais do spike T04.
// Só os campos usados pelo Καιρός são validados; os demais (sv, is, lc…) são ignorados.
import { z } from 'zod';

/** Horário local "HH:MM" (America/Sao_Paulo, sem data), como em `hr` e `vs[].t`. */
export const HoraMinutoSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'horário HH:MM inválido');

// GET /Linha/Buscar?termosBusca=
export const OlhoVivoLinhaSchema = z.object({
  cl: z.number().int().positive(), // código da linha, único por sentido
  lt: z.string(), // 1ª parte do letreiro, ex.: "875A"
  tl: z.number().int(), // 2ª parte do letreiro, ex.: 10
  sl: z.union([z.literal(1), z.literal(2)]), // sentido
  tp: z.string(), // terminal principal
  ts: z.string(), // terminal secundário
});

export const OlhoVivoLinhasSchema = OlhoVivoLinhaSchema.array();
export type OlhoVivoLinha = z.infer<typeof OlhoVivoLinhaSchema>;

// GET /Parada/BuscarParadasPorLinha?codigoLinha=
export const OlhoVivoParadaSchema = z.object({
  cp: z.number().int().positive(),
  np: z.string(),
  ed: z.string().nullish(),
  py: z.number(), // latitude
  px: z.number(), // longitude
});

export const OlhoVivoParadasSchema = OlhoVivoParadaSchema.array();
export type OlhoVivoParada = z.infer<typeof OlhoVivoParadaSchema>;

// GET /Previsao/Parada?codigoParada=
export const OlhoVivoVeiculoSchema = z.object({
  p: z.string().optional(), // prefixo
  t: HoraMinutoSchema, // horário previsto de chegada na parada
});

export const OlhoVivoLinhaPrevisaoSchema = z.object({
  c: z.string(), // letreiro completo, ex.: "875A-10"
  cl: z.number().int().positive(),
  // O formato "sem veículos" não foi observado no T04: aceita vs ausente ou null
  vs: OlhoVivoVeiculoSchema.array().nullish(),
});

export const OlhoVivoPrevisaoParadaSchema = z.object({
  hr: HoraMinutoSchema, // horário de referência da geração
  // Parada sem previsão: formato não observado no T04; aceita p ausente/null e l ausente/null
  p: z
    .object({
      cp: z.number().int().positive(),
      np: z.string().nullish(),
      l: OlhoVivoLinhaPrevisaoSchema.array().nullish(),
    })
    .nullish(),
});

export type OlhoVivoPrevisaoParada = z.infer<typeof OlhoVivoPrevisaoParadaSchema>;
