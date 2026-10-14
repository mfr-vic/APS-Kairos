// RF03: fallback local com as 10 linhas que têm fonte desde a chave ARTESP (13/10/2026).
import {
  canaisOficiais,
  LINHAS_TRILHO_LOCAL,
  nomeLinhaTrilho,
  operadoraLinhaTrilho,
} from '@/features/trajetos/linhas-trilho';

describe('linhas de trilho (fallback local)', () => {
  it('1, 2, 3 e 15 pelo Metrô; 4–9 com as operadoras da API Trilhos; CPTM fora', () => {
    expect(LINHAS_TRILHO_LOCAL.map((l) => [l.linha, l.operadora])).toEqual([
      ['L1', 'Metrô'],
      ['L2', 'Metrô'],
      ['L3', 'Metrô'],
      ['L4', 'ViaQuatro'],
      ['L5', 'ViaMobilidade 5'],
      ['L6', 'Linha Uni'],
      ['L7', 'TIC Trens'],
      ['L8', 'ViaMobilidade 8 e 9'],
      ['L9', 'ViaMobilidade 8 e 9'],
      ['L15', 'Metrô'],
    ]);
  });

  it('nomes completos, incluindo as linhas novas', () => {
    expect(nomeLinhaTrilho('L6')).toBe('Linha 6-Laranja');
    expect(nomeLinhaTrilho('L7')).toBe('Linha 7-Rubi');
    expect(nomeLinhaTrilho('L8')).toBe('Linha 8-Diamante');
    expect(nomeLinhaTrilho('L9')).toBe('Linha 9-Esmeralda');
    expect(nomeLinhaTrilho('L11')).toBe('Linha 11');
  });

  it('canais oficiais pela operadora (4/5 não dizem mais "Metrô")', () => {
    expect(canaisOficiais('L1')).toBe('nos canais oficiais do Metrô');
    expect(canaisOficiais('L4')).toBe('nos canais oficiais da ViaQuatro');
    expect(canaisOficiais('L5')).toBe('nos canais oficiais da ViaMobilidade 5');
    expect(canaisOficiais('L11')).toBe('nos canais oficiais da CPTM');
    expect(operadoraLinhaTrilho('L12')).toBe('CPTM');
  });
});
