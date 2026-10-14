// Escolha entre provedores reais e simulados (T21, RF19, C.3). Para o BriefingService (T27):
//
//   const cenario = new CenarioAtivo(clock);                       // 1 por app
//   const simulados = criarProvedoresSimulados(cenario, clock);    // 1 por app
//   app.register(demoRoutes, { demoMode, demoToken, cenario });    // config lida do env no index.ts
//   // a cada briefing (o cenário muda em tempo de execução, então a escolha é por requisição):
//   const p = selecionarProvedores({ demoMode, cenario, reais, simulados });
//   await Promise.allSettled([runner.observe(p.weather, entradaClima, …), …]);
//
// Regra: simulados só com DEMO_MODE=true E cenário ativo ≠ `real`. Com DEMO_MODE=false, sempre os
// reais, qualquer que seja o estado (a rota de demo responde 404 e não muda nada).
import type { CenarioAtivo } from './cenario-ativo.js';

export interface SelecaoProvedores<T> {
  demoMode: boolean;
  cenario: CenarioAtivo;
  reais: T;
  simulados: T;
}

export function selecionarProvedores<T>({ demoMode, cenario, reais, simulados }: SelecaoProvedores<T>): T {
  return demoMode && cenario.usaSimulados() ? simulados : reais;
}
