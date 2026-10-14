// Base dos provedores simulados (T21, RF19, RNF08). Cada adaptador simulado implementa a MESMA
// interface DimensionProvider dos reais e passa pelo mesmo ProviderRunner (cache → breaker →
// timeout → validação → envelope). O comportamento vem do cenário ativo (modules/demo):
// valor normal, chuva forte etc. (`valor`), atraso (TC13), falha (TC12/TC18),
// JSON malformado / campo faltando (TC14) e observedAt antigo (`idadeSegundos`, TC15).
//
// `source` = "simulado:<fonte real>" (ex.: "simulado:open-meteo"), de propósito:
// - o envelope que chega ao app nunca atribui um dado inventado à fonte real;
// - o runner indexa cache, circuit breaker e estatísticas por `source`, então os simulados não
//   abrem o breaker nem sujam o cache/health dos reais (e vice-versa) quando a demo alterna;
// - os logs (RNF09) mostram de onde veio cada observação.
import type { Dimension } from '@kairos/contracts';
import type { Clock } from '../../infrastructure/clock.js';
import { HttpStatusError, InvalidJsonError, ProviderAbortedError } from '../../infrastructure/errors.js';
import { truncar } from '../../infrastructure/http-client.js';
import type {
  DimensionProvider,
  DimensionValue,
  ProviderFetchContext,
  ProviderResult,
} from '../../infrastructure/provider.js';
import type { Comportamento, FonteDeCenario, ParametrosPorDimensao } from './cenario-simulado.js';

/** Prefixo do `source` de todo provedor simulado. */
export const PREFIXO_SIMULADO = 'simulado:';

/** Corpo truncado usado no comportamento `json-malformado`. */
export const CORPO_MALFORMADO = '{"simulado": true, "dados": [1, 2,';

export interface SimulatedAdapterOptions {
  /** Estado do cenário ativo (modules/demo/cenario-ativo.ts). */
  fonte: FonteDeCenario;
  /** Mesmo relógio do ProviderRunner (FakeClock nos testes). */
  clock: Clock;
}

/**
 * Base dos simulados. A entrada é `unknown` de propósito: o simulado aceita a entrada do adaptador
 * real correspondente (ou o próprio trajeto) e ignora o que não reconhece, então o T27 troca um
 * pelo outro sem converter nada.
 */
export abstract class SimulatedAdapter<D extends Dimension> implements DimensionProvider<unknown, D> {
  abstract readonly dimension: D;
  abstract readonly source: string;
  abstract readonly ttlSeconds: number;
  /** Chamadas que chegaram à "fonte" (TC18: com o breaker aberto o provedor não é chamado). */
  chamadas = 0;

  protected readonly fonte: FonteDeCenario;
  protected readonly clock: Clock;

  constructor(options: SimulatedAdapterOptions) {
    this.fonte = options.fonte;
    this.clock = options.clock;
  }

  /** Parâmetros do valor normal desta dimensão. */
  protected abstract readonly padrao: ParametrosPorDimensao[D];
  /** Campo obrigatório removido no comportamento `campo-faltando`. */
  protected abstract readonly campoObrigatorio: keyof DimensionValue<D> & string;
  /** Monta um valor do contrato a partir dos parâmetros, da entrada e do instante observado. */
  protected abstract montarValor(params: ParametrosPorDimensao[D], input: unknown, observadoMs: number): DimensionValue<D>;

  /** Parte da entrada que muda o valor (ex.: linhas pedidas); '' se nenhuma. */
  protected chaveDaEntrada(_input: unknown): string {
    return '';
  }

  /** Comportamento da dimensão no cenário ativo; ausente = valor normal. */
  comportamentoAtual(): Comportamento<ParametrosPorDimensao[D]> {
    const simulacao = this.fonte.simulacao();
    const comportamento = simulacao?.[this.dimension] as Comportamento<ParametrosPorDimensao[D]> | undefined;
    return comportamento ?? { tipo: 'valor' };
  }

  cacheKey(input: unknown): string {
    return `${this.fonte.chave()}:${this.chaveDaEntrada(input)}`;
  }

  async fetch(input: unknown, ctx: ProviderFetchContext): Promise<ProviderResult<DimensionValue<D>>> {
    this.chamadas++;
    const comportamento = this.comportamentoAtual();

    switch (comportamento.tipo) {
      case 'valor': {
        const observadoMs = this.clock.now() - (comportamento.idadeSegundos ?? 0) * 1000;
        // `tipo` e `idadeSegundos` sobram no objeto, mas montarValor só lê os parâmetros da dimensão
        const params = { ...this.padrao, ...(comportamento as Partial<ParametrosPorDimensao[D]>) };
        return { value: this.montarValor(params, input, observadoMs), observedAt: new Date(observadoMs).toISOString() };
      }
      case 'atraso': {
        await esperar(comportamento.ms, ctx.signal);
        const agora = this.clock.now();
        return { value: this.montarValor(this.padrao, input, agora), observedAt: new Date(agora).toISOString() };
      }
      case 'falha': {
        const status = comportamento.httpStatus ?? 503;
        throw new HttpStatusError(status, `${this.source}/simulado`, 'Service Unavailable (simulado)');
      }
      case 'json-malformado':
        // Mesmo erro que o http-client lança quando o JSON.parse do corpo falha
        throw new InvalidJsonError(truncar(CORPO_MALFORMADO));
      case 'campo-faltando': {
        const agora = this.clock.now();
        const valor: Record<string, unknown> = { ...this.montarValor(this.padrao, input, agora) };
        delete valor[this.campoObrigatorio];
        // Fora do contrato de propósito: quem barra é a validação do runner (C.5, TC14)
        return { value: valor as unknown as DimensionValue<D>, observedAt: new Date(agora).toISOString() };
      }
    }
  }
}

/** Espera `ms` ou rejeita quando o signal aborta (timeout do runner ou prazo global), limpando o timer. */
function esperar(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new ProviderAbortedError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ProviderAbortedError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export const HORA_MS = 60 * 60 * 1000;

/** ISO 8601 com fuso -03:00 (RNF13; São Paulo sem horário de verão desde 2019). */
export function isoSaoPaulo(ms: number): string {
  return new Date(ms - 3 * HORA_MS).toISOString().slice(0, 19) + '-03:00';
}

/** Próxima hora cheia estritamente depois de `ms`. */
export function proximaHoraCheia(ms: number): number {
  return Math.floor(ms / HORA_MS) * HORA_MS + HORA_MS;
}
