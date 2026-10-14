// Espelha a C.5 da especificação (README): parâmetros de tolerância a falhas do
// servidor, mostrados na tela Provedores (RF18). Ao mudar a C.5, atualize aqui junto.
// Também a taxa de sucesso por fonte, a partir dos contadores do /v1/health/providers.

export const TOLERANCIA_FALHAS: { rotulo: string; valor: string }[] = [
  { rotulo: 'Tempo limite por fonte', valor: '3 s' },
  { rotulo: 'Prazo global do briefing', valor: '4 s' },
  { rotulo: 'Circuit breaker', valor: 'abre após 3 falhas seguidas, por 60 s' },
  { rotulo: 'Cache: clima', valor: '15 min' },
  { rotulo: 'Cache: qualidade do ar', valor: '60 min' },
  { rotulo: 'Cache: ônibus (previsão)', valor: '30 s' },
  { rotulo: 'Cache: Metrô (Direto do Metrô)', valor: '5 min' },
  { rotulo: 'Cache: trilhos (ARTESP, até 12 consultas/h)', valor: '6 min' },
  { rotulo: 'Cache: rota (OSRM)', valor: '7 dias' },
  { rotulo: 'Cache: endereços (Nominatim)', valor: '30 dias' },
  { rotulo: 'Cache: alagamento', valor: '24 h' },
  { rotulo: 'Sem rede no aparelho', valor: 'mostra os dados salvos' },
];

/** "% ok" das requisições; null sem requisições (evita "0 %" enganoso). */
export function percentualSucesso(requestCount: number, successCount: number): number | null {
  if (requestCount <= 0) return null;
  return Math.round((successCount / requestCount) * 100);
}

/** "8/10 ok (80%)" ou "Sem requisições ainda". */
export function resumoContadores(requestCount: number, successCount: number): string {
  const pct = percentualSucesso(requestCount, successCount);
  return pct === null ? 'Sem requisições ainda' : `${successCount}/${requestCount} ok (${pct}%)`;
}
