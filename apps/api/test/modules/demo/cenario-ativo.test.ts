import { describe, expect, it } from 'vitest';
import { CENARIOS, CenarioAtivo } from '../../../src/modules/demo/index.js';
import { FakeClock } from '../../infrastructure/helpers.js';

describe('CenarioAtivo (T21)', () => {
  it('começa em `real`: sem simulação', () => {
    const cenario = new CenarioAtivo(new FakeClock());
    expect(cenario.nome).toBe('real');
    expect(cenario.usaSimulados()).toBe(false);
    expect(cenario.simulacao()).toBeNull();
  });

  it('ativar devolve o anterior, troca a simulação e registra o instante', () => {
    const clock = new FakeClock(Date.parse('2026-10-10T12:00:00Z'));
    const cenario = new CenarioAtivo(clock);
    clock.advance(5_000);

    expect(cenario.ativar('chuva-forte')).toBe('real');
    expect(cenario.nome).toBe('chuva-forte');
    expect(cenario.usaSimulados()).toBe(true);
    expect(cenario.simulacao()).toBe(CENARIOS['chuva-forte'].simulacao);
    expect(cenario.ativadoEm).toBe('2026-10-10T12:00:05.000Z');
  });

  it('a chave muda a cada ativação, mesmo reativando o mesmo cenário (descarta o cache dos simulados)', () => {
    const cenario = new CenarioAtivo(new FakeClock());
    const chaves = new Set([cenario.chave()]);
    cenario.ativar('normal');
    chaves.add(cenario.chave());
    cenario.ativar('normal');
    chaves.add(cenario.chave());
    expect(chaves.size).toBe(3);
  });
});
