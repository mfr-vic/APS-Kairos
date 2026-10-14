// UV (OMS) e umidade (Defesa Civil SP): rótulo e nível nos limiares exatos.
import { faixaUmidade, faixaUv } from '@/features/tempo/faixas';

describe('faixaUv', () => {
  it.each([
    [0, 'baixo', 0],
    [2.9, 'baixo', 0],
    [3, 'moderado', 0],
    [6, 'alto', 1],
    [8, 'muito alto', 2],
    [11, 'extremo', 3],
  ])('UV %s → %s (nível %i)', (uv, rotulo, nivel) => {
    expect(faixaUv(uv)).toEqual({ rotulo, nivel });
  });
});

describe('faixaUmidade', () => {
  it.each([
    [30, null],
    [29.9, { rotulo: 'atenção', nivel: 1 }],
    [19.9, { rotulo: 'alerta', nivel: 2 }],
    [11.9, { rotulo: 'emergência', nivel: 3 }],
  ])('umidade %s%% → %j', (pct, esperado) => {
    expect(faixaUmidade(pct)).toEqual(esperado);
  });
});
