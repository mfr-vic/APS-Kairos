// TC08: confiança C1–C3 (RF13, T25)
import { describe, expect, it } from 'vitest';
import { ConfidenceSchema, type Confidence } from '@kairos/contracts';
import { calcularConfianca, dimensoesRelevantes } from '../../../src/modules/rules/confidence.js';
import type { TrajetoVinculos } from '../../../src/modules/rules/verdict.js';
import {
  COM_ONIBUS,
  COM_ONIBUS_E_TRILHOS,
  COM_TRILHOS,
  SEM_TRANSPORTE,
  alagamento,
  ar,
  base,
  clima,
  onibus,
  transito,
  trilhos,
} from './fixtures.js';
import type { Observation } from '@kairos/contracts';

const bus = (status: 'fresh' | 'stale' | 'unavailable' = 'fresh') =>
  onibus([{ codigoLinha: 609, letreiro: '875A-10', minutos: 5 }], status);
const rail = (status: 'fresh' | 'stale' | 'unavailable' = 'fresh') =>
  trilhos([{ linha: 'L9', statusTexto: 'Operação Normal', situacao: 'NORMAL' }], status);

function confianca(obs: Observation[], trajeto: TrajetoVinculos): Confidence {
  const c = calcularConfianca(obs, trajeto);
  expect(ConfidenceSchema.safeParse(c).success).toBe(true);
  return c;
}

describe('dimensões relevantes ao trajeto (B.8)', () => {
  it('weather, air e flood sempre; bus e rail só se vinculados; traffic só com ônibus', () => {
    expect(dimensoesRelevantes(SEM_TRANSPORTE)).toEqual(['weather', 'air', 'flood']);
    expect(dimensoesRelevantes(COM_TRILHOS)).toEqual(['weather', 'air', 'rail', 'flood']);
    expect(dimensoesRelevantes(COM_ONIBUS_E_TRILHOS)).toEqual(['weather', 'air', 'bus', 'traffic', 'rail', 'flood']);
  });
});

describe('confiança e trânsito (RF22, 14/10/2026)', () => {
  const semTransito = () => base().filter((o) => o.dimension !== 'traffic');

  it('trajeto só de trilhos: trânsito indisponível (sem TOMTOM_KEY) não derruba a confiança', () => {
    expect(confianca([...semTransito(), transito({}, 'unavailable'), rail()], COM_TRILHOS).nivel).toBe('ALTA');
    expect(confianca([...semTransito(), rail()], COM_TRILHOS).nivel).toBe('ALTA');
  });

  it('com ônibus: trânsito indisponível conta (a RN09 pesa no veredito) → MÉDIA citando trânsito', () => {
    const c = confianca([...semTransito(), transito({}, 'unavailable'), bus()], COM_ONIBUS);
    expect(c).toEqual({ nivel: 'MEDIA', explicacao: 'Sem dados de trânsito (Tempo limite de 3 s excedido)' });
  });

  it('com ônibus: trânsito stale → MÉDIA', () => {
    expect(confianca([...semTransito(), transito({}, 'stale'), bus()], COM_ONIBUS)).toEqual({
      nivel: 'MEDIA',
      explicacao: 'Dados desatualizados de trânsito',
    });
  });
});

describe('TC08 — confiança', () => {
  it('todas fresh → ALTA', () => {
    const c = confianca([...base(), bus(), rail()], COM_ONIBUS_E_TRILHOS);
    expect(c).toEqual({ nivel: 'ALTA', explicacao: 'Todos os dados do trajeto estão atualizados' });
  });

  it('1 stale → MÉDIA', () => {
    const c = confianca([...base(), bus('stale'), rail()], COM_ONIBUS_E_TRILHOS);
    expect(c).toEqual({ nivel: 'MEDIA', explicacao: 'Dados desatualizados de ônibus' });
  });

  it('exatamente 1 unavailable → MÉDIA, com o motivo da fonte', () => {
    const c = confianca([...base(), bus(), rail('unavailable')], COM_ONIBUS_E_TRILHOS);
    expect(c).toEqual({ nivel: 'MEDIA', explicacao: 'Sem dados de trilhos (Tempo limite de 3 s excedido)' });
  });

  it('2 unavailable → BAIXA', () => {
    const c = confianca([...base(), bus('unavailable'), rail('unavailable')], COM_ONIBUS_E_TRILHOS);
    expect(c).toEqual({ nivel: 'BAIXA', explicacao: 'Sem dados de ônibus e trilhos' });
  });

  it('clima unavailable → BAIXA (mesmo sendo o único)', () => {
    const c = confianca([clima([], { status: 'unavailable' }), ar(10), alagamento([])], SEM_TRANSPORTE);
    expect(c.nivel).toBe('BAIXA');
    expect(c.explicacao).toBe('Sem dados de clima (Tempo limite de 3 s excedido)');
  });

  it('dimensão não vinculada não conta: ônibus unavailable sem linha vinculada → ALTA', () => {
    expect(confianca([...base(), bus('unavailable')], SEM_TRANSPORTE).nivel).toBe('ALTA');
  });

  it('observação relevante ausente conta como unavailable', () => {
    const c = confianca([clima([0]), ar(10)], SEM_TRANSPORTE);
    expect(c).toEqual({ nivel: 'MEDIA', explicacao: 'Sem dados de alagamentos' });
  });

  it('1 unavailable + stale → MÉDIA com as duas partes', () => {
    const c = confianca([clima([0], { status: 'stale' }), ar(10), alagamento([]), transito(), bus('unavailable')], COM_ONIBUS);
    expect(c.nivel).toBe('MEDIA');
    expect(c.explicacao).toBe('Sem dados de ônibus (Tempo limite de 3 s excedido); dados desatualizados de clima');
  });
});
