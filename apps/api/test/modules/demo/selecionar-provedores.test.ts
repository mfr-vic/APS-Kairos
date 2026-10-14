import { describe, expect, it } from 'vitest';
import { CenarioAtivo, selecionarProvedores } from '../../../src/modules/demo/index.js';
import { FakeClock } from '../../infrastructure/helpers.js';

const reais = { tipo: 'reais' };
const simulados = { tipo: 'simulados' };

describe('selecionarProvedores (T21, C.3)', () => {
  it.each([
    [false, 'real', reais],
    [false, 'chuva-forte', reais], // DEMO_MODE=false ignora o estado
    [true, 'real', reais],
    [true, 'chuva-forte', simulados],
    [true, 'normal', simulados],
  ] as const)('demoMode=%s, cenário %s', (demoMode, nome, esperado) => {
    const cenario = new CenarioAtivo(new FakeClock());
    cenario.ativar(nome);
    expect(selecionarProvedores({ demoMode, cenario, reais, simulados })).toBe(esperado);
  });
});
