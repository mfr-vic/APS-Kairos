// Modo demonstração (T21, RF19): cenários nomeados, estado ativo, escolha real × simulado e rotas.
export { CenarioAtivo } from './cenario-ativo.js';
export {
  CENARIOS,
  NOMES_CENARIO,
  NomeCenarioSchema,
  TRAJETO_REFERENCIA,
  type Cenario,
  type EsperadoCenario,
  type NomeCenario,
} from './cenarios.js';
export {
  AtivarCenarioRequestSchema,
  HEADER_TOKEN,
  ROTA_CENARIO,
  demoRoutes,
  type CenarioAtivoResponse,
  type DemoRoutesOptions,
} from './demo.routes.js';
export { selecionarProvedores, type SelecaoProvedores } from './selecionar-provedores.js';
