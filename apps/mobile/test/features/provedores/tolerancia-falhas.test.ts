// Parâmetros da C.5 e "% ok" por fonte.
import {
  percentualSucesso,
  resumoContadores,
  TOLERANCIA_FALHAS,
} from '@/features/provedores/tolerancia-falhas';

describe('tolerância a falhas (C.5)', () => {
  it('lista timeout, prazo global, breaker, TTLs e o comportamento offline', () => {
    const mapa = Object.fromEntries(TOLERANCIA_FALHAS.map((p) => [p.rotulo, p.valor]));
    expect(mapa['Tempo limite por fonte']).toBe('3 s');
    expect(mapa['Prazo global do briefing']).toBe('4 s');
    expect(mapa['Circuit breaker']).toBe('abre após 3 falhas seguidas, por 60 s');
    expect(mapa['Cache: clima']).toBe('15 min');
    expect(mapa['Cache: qualidade do ar']).toBe('60 min');
    expect(mapa['Cache: ônibus (previsão)']).toBe('30 s');
    expect(mapa['Cache: Metrô (Direto do Metrô)']).toBe('5 min');
    expect(mapa['Cache: trilhos (ARTESP, até 12 consultas/h)']).toBe('6 min');
    expect(mapa['Cache: rota (OSRM)']).toBe('7 dias');
    expect(mapa['Cache: endereços (Nominatim)']).toBe('30 dias');
    expect(mapa['Cache: alagamento']).toBe('24 h');
    expect(mapa['Sem rede no aparelho']).toBe('mostra os dados salvos');
  });

  it('percentualSucesso: arredonda; sem requisições → null', () => {
    expect(percentualSucesso(0, 0)).toBeNull();
    expect(percentualSucesso(3, 2)).toBe(67);
    expect(percentualSucesso(10, 10)).toBe(100);
  });

  it('resumoContadores', () => {
    expect(resumoContadores(0, 0)).toBe('Sem requisições ainda');
    expect(resumoContadores(10, 8)).toBe('8/10 ok (80%)');
  });
});
