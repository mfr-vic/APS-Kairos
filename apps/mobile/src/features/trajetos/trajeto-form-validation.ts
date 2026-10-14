// Validação do formulário de trajeto com mensagens em pt-BR (TC22).
// O resultado ainda passa pelo TrajetoRequestSchema do contrato no armazenamento.
import type { BusLine, RailLine } from '@kairos/contracts';
import { z } from 'zod';

import type { DadosTrajeto, TrajetoSalvo } from './storage';

export type ValoresPonto = { rotulo: string; lat: string; lon: string };

export type ValoresFormulario = {
  nome: string;
  origem: ValoresPonto;
  destino: ValoresPonto;
  trilhos: RailLine[];
  // RF02: editado pelo BusPicker, que já respeita o limite e o ponto único do contrato.
  onibus: BusLine[];
};

export const FORMULARIO_VAZIO: ValoresFormulario = {
  nome: '',
  origem: { rotulo: '', lat: '', lon: '' },
  destino: { rotulo: '', lat: '', lon: '' },
  trilhos: [],
  onibus: [],
};

/** Aceita vírgula ou ponto como separador decimal. */
function numero(campo: string, min: number, max: number) {
  return z
    .string()
    .trim()
    .min(1, `Informe a ${campo}.`)
    .transform((s) => s.replace(',', '.'))
    .refine(
      (s) => /^-?\d+(\.\d+)?$/.test(s),
      `${capitalizar(campo)} deve ser um número, ex.: -23.5505.`
    )
    .transform(Number)
    .refine((n) => n >= min && n <= max, `${capitalizar(campo)} deve estar entre ${min} e ${max}.`);
}

function capitalizar(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** `doPonto` = "da origem" / "do destino". */
function pontoSchema(doPonto: string) {
  return z.object({
    rotulo: z.string().trim().max(60, `O rótulo ${doPonto} deve ter até 60 caracteres.`),
    lat: numero(`latitude ${doPonto}`, -90, 90),
    lon: numero(`longitude ${doPonto}`, -180, 180),
  });
}

const FormularioSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, 'Dê um nome ao trajeto.')
    .max(60, 'O nome deve ter até 60 caracteres.'),
  origem: pontoSchema('da origem'),
  destino: pontoSchema('do destino'),
  trilhos: z.array(z.string()).max(10, 'Selecione no máximo 10 linhas de trilho.'),
  onibus: z.array(z.any()).max(3, 'No máximo 3 linhas de ônibus.'),
});

export type ErrosFormulario = Partial<Record<string, string>>;

export type ResultadoValidacao =
  { ok: true; dados: DadosTrajeto } | { ok: false; erros: ErrosFormulario };

/** Valida e converte; as chaves dos erros são caminhos como "origem.lat". */
export function validarFormulario(valores: ValoresFormulario): ResultadoValidacao {
  const r = FormularioSchema.safeParse(valores);
  if (!r.success) {
    const erros: ErrosFormulario = {};
    for (const issue of r.error.issues) {
      const chave = issue.path.join('.');
      erros[chave] ??= issue.message;
    }
    return { ok: false, erros };
  }
  const { nome, origem, destino } = r.data;
  return {
    ok: true,
    dados: {
      nome,
      trajeto: {
        origem: { lat: origem.lat, lon: origem.lon, rotulo: origem.rotulo || 'Origem' },
        destino: { lat: destino.lat, lon: destino.lon, rotulo: destino.rotulo || 'Destino' },
        onibus: valores.onibus,
        trilhos: valores.trilhos,
      },
    },
  };
}

export function valoresDeTrajeto(t: TrajetoSalvo): ValoresFormulario {
  const ponto = (p: TrajetoSalvo['trajeto']['origem']): ValoresPonto => ({
    rotulo: p.rotulo,
    lat: String(p.lat),
    lon: String(p.lon),
  });
  return {
    nome: t.nome,
    origem: ponto(t.trajeto.origem),
    destino: ponto(t.trajeto.destino),
    trilhos: [...t.trajeto.trilhos],
    onibus: [...t.trajeto.onibus],
  };
}
