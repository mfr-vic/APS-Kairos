// Tabela WMO → descrição/ícone; ícone por hora derivado da chuva prevista.
import { condicaoDoCodigo, iconeDaHora } from '@/features/tempo/codigo-tempo';

describe('condicaoDoCodigo', () => {
  it.each([
    [0, 'Céu limpo', 'ceuLimpo'],
    [2, 'Parcialmente nublado', 'parcialNublado'],
    [3, 'Nublado', 'nublado'],
    [48, 'Nevoeiro', 'nevoeiro'],
    [55, 'Garoa', 'garoa'],
    [61, 'Chuva fraca', 'clima'],
    [65, 'Chuva forte', 'clima'],
    [82, 'Pancadas fortes', 'pancadas'],
    [95, 'Tempestade', 'tempestade'],
    [99, 'Tempestade com granizo', 'granizo'],
  ])('código %i → %s (%s)', (codigo, descricao, icone) => {
    expect(condicaoDoCodigo(codigo)).toEqual({ descricao, icone });
  });

  it('null, undefined ou código fora da tabela → null', () => {
    expect(condicaoDoCodigo(null)).toBeNull();
    expect(condicaoDoCodigo(undefined)).toBeNull();
    expect(condicaoDoCodigo(42)).toBeNull();
  });
});

describe('iconeDaHora', () => {
  it('chuva ≥ 2,5 pancadas; ≥ 0,5 chuva; traço ou ≥ 40 % garoa; senão parcialmente nublado', () => {
    expect(iconeDaHora({ precipitacaoMm: 3, probabilidadePrecipitacao: 90 })).toBe('pancadas');
    expect(iconeDaHora({ precipitacaoMm: 0.6, probabilidadePrecipitacao: 60 })).toBe('clima');
    expect(iconeDaHora({ precipitacaoMm: 0.1, probabilidadePrecipitacao: 10 })).toBe('garoa');
    expect(iconeDaHora({ precipitacaoMm: 0, probabilidadePrecipitacao: 40 })).toBe('garoa');
    expect(iconeDaHora({ precipitacaoMm: 0, probabilidadePrecipitacao: null })).toBe('parcialNublado');
  });
});
