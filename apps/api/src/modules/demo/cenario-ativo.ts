// Estado do cenário de demonstração (T21, RF19): compartilhado pela rota /v1/demo/scenario e pelos
// provedores simulados. Crie UMA instância por app (como o ProviderRunner) e passe às duas pontas.
import { systemClock, type Clock } from '../../infrastructure/clock.js';
import type { CenarioSimulado, FonteDeCenario } from '../../providers/simulated/index.js';
import { CENARIOS, type NomeCenario } from './cenarios.js';

export class CenarioAtivo implements FonteDeCenario {
  private atual: NomeCenario;
  private versao = 0;
  private ativadoEmMs: number;

  constructor(
    private readonly clock: Clock = systemClock,
    inicial: NomeCenario = 'real',
  ) {
    this.atual = inicial;
    this.ativadoEmMs = clock.now();
  }

  get nome(): NomeCenario {
    return this.atual;
  }

  get ativadoEm(): string {
    return new Date(this.ativadoEmMs).toISOString();
  }

  /** Ativa um cenário. Reativar o mesmo também conta: a versão muda e o cache dos simulados é ignorado. */
  ativar(nome: NomeCenario): NomeCenario {
    const anterior = this.atual;
    this.atual = nome;
    this.versao++;
    this.ativadoEmMs = this.clock.now();
    return anterior;
  }

  /** true se o briefing deve usar os simulados (qualquer cenário ≠ `real`). */
  usaSimulados(): boolean {
    return CENARIOS[this.atual].simulacao !== null;
  }

  chave(): string {
    return `${this.atual}#${this.versao}`;
  }

  simulacao(): CenarioSimulado | null {
    return CENARIOS[this.atual].simulacao;
  }
}
