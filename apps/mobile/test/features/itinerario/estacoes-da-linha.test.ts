// Integridade do estacoes.json gerado (contagens conferidas em 13/10/2026 contra a página do Metrô e
// o fixture real da ARTESP; ver scripts/gerar-estacoes.mjs).
import { distanciaM } from '@/features/itinerario/geometria';
import { estacoesDaLinha } from '@/features/itinerario/estacoes-da-linha';

const CONTAGEM = {
  L1: 23,
  L2: 14,
  L3: 18,
  L4: 11,
  L5: 17,
  L6: 15,
  L7: 17,
  L8: 23,
  L9: 21,
  L15: 11,
} as const;

describe('estacoesDaLinha', () => {
  it.each(Object.entries(CONTAGEM))('%s tem %i estações com fonte registrada', (linha, n) => {
    const d = estacoesDaLinha(linha as keyof typeof CONTAGEM)!;
    expect(d.estacoes).toHaveLength(n);
    expect(d.fonteOrdem.url).toMatch(/^https:\/\//);
    expect(d.fonteOrdem.consultadoEm).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('terminais na ordem da fonte (ex.: L2 Vila Prudente → Vila Madalena)', () => {
    const nomes = estacoesDaLinha('L2')!.estacoes.map((e) => e.nome);
    expect(nomes[0]).toBe('Vila Prudente');
    expect(nomes.at(-1)).toBe('Vila Madalena');
  });

  it('coordenadas na Grande SP e estações vizinhas a menos de 6 km (pega casamento errado de nome)', () => {
    for (const linha of Object.keys(CONTAGEM) as (keyof typeof CONTAGEM)[]) {
      const est = estacoesDaLinha(linha)!.estacoes;
      for (const e of est) {
        if (!e.coordenada) continue;
        expect(e.coordenada.lat).toBeGreaterThan(-24.1);
        expect(e.coordenada.lat).toBeLessThan(-23.1);
        expect(e.coordenada.lon).toBeGreaterThan(-47.0);
        expect(e.coordenada.lon).toBeLessThan(-46.1);
      }
      for (let i = 1; i < est.length; i++) {
        const a = est[i - 1].coordenada;
        const b = est[i].coordenada;
        if (a && b) expect(distanciaM(a, b)).toBeLessThan(6_000);
      }
    }
  });

  it('CPTM (10–13) não tem itinerário', () => {
    expect(estacoesDaLinha('L10')).toBeNull();
  });
});
