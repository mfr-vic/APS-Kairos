// RouteGeometryService (T20, RF24, RF22): geometria do trajeto e trânsito numa só chamada.
// Ordem desde 14/10/2026: TomTom (carro, com trânsito) → OSRM → linha reta. A linha reta só existe para a
// consulta de alagamento por raio (RN03/RN04); o app não a mostra como rota. Nunca lança: o briefing
// continua 200 com as fontes fora (TC29).
import type { Geometry, LatLon, TrafficValue } from '@kairos/contracts';
import type { ProviderLogger, ProviderOutcome, ProviderRunner, RunOptions } from '../../infrastructure/provider-runner.js';
import type { ObservationOf, Provider } from '../../infrastructure/provider.js';
import type { CoordenadaLonLat, RotaInput, RotaOsrm } from '../../providers/routing/osrm.adapter.js';
import { TOMTOM_SOURCE, TOMTOM_TTL_CARRO_S, type RotaTomTom } from '../../providers/routing/tomtom.adapter.js';
import { classificarNivelTransito } from '../rules/index.js';

export const MOTIVO_SEM_TOMTOM = 'TomTom não configurada no servidor (sem TOMTOM_KEY)';

/** Segmento origem→destino em [lon, lat] (2 pontos), usado só com o buffer de 300 m (RN03). */
export function linhaReta(origem: LatLon, destino: LatLon): Geometry {
  return {
    fonte: 'linha-reta',
    coordenadas: [
      [origem.lon, origem.lat],
      [destino.lon, destino.lat],
    ],
  };
}

/** Rota TomTom → valor do contrato (RF22). Sem `noTrafficTravelTimeInSeconds`, livre = atual − atraso. */
export function valorTransito(rota: RotaTomTom): TrafficValue {
  const duracaoLivreS = rota.duracaoLivreS ?? Math.max(0, rota.duracaoS - rota.atrasoS);
  return {
    distanciaM: rota.distanciaM,
    duracaoLivreS,
    duracaoAtualS: rota.duracaoS,
    atrasoS: rota.atrasoS,
    nivel: classificarNivelTransito(rota.duracaoS, duracaoLivreS),
    trechosLentos: rota.trechosLentos.map((t) => ({ ...t })),
  };
}

function observacaoTransito(o: ProviderOutcome<RotaTomTom> | null, motivo: string): ObservationOf<'traffic'> {
  const base = { dimension: 'traffic' as const, source: TOMTOM_SOURCE, ttlSeconds: TOMTOM_TTL_CARRO_S };
  if (!o || o.status === 'unavailable') {
    return { ...base, status: 'unavailable', observedAt: o?.observedAt ?? null, fetchedAt: o?.fetchedAt ?? null, value: null, motivo: o?.motivo ?? motivo };
  }
  return {
    ...base,
    status: o.status,
    observedAt: o.observedAt,
    fetchedAt: o.fetchedAt,
    value: valorTransito(o.value),
    ...(o.motivo ? { motivo: o.motivo } : {}),
  };
}

function copiar(coordenadas: readonly CoordenadaLonLat[]): CoordenadaLonLat[] {
  // Cópia: o LRU guarda a referência, e quem recebe a geometria não pode alterar o cache
  return coordenadas.map(([lon, lat]) => [lon, lat]);
}

export interface RotaDoTrajeto {
  geometria: Geometry;
  /** Dimensão `traffic` do briefing, da MESMA chamada TomTom que deu a geometria. */
  transito: ObservationOf<'traffic'>;
}

export class RouteGeometryService {
  constructor(
    /** O runner único da aplicação (cache, breaker e limitadores da TomTom e do OSRM). */
    private readonly runner: ProviderRunner,
    private readonly osrm: Provider<RotaInput, RotaOsrm>,
    /** TomTom de carro; null sem TOMTOM_KEY (geometria pelo OSRM, `traffic` unavailable). */
    private readonly tomtom: Provider<RotaInput, RotaTomTom> | null = null,
  ) {}

  /** Só a geometria (mesmas fontes e mesmo cache de `calcularComTransito`). */
  async calcular(origem: LatLon, destino: LatLon, opts: RunOptions): Promise<Geometry> {
    return (await this.calcularComTransito(origem, destino, opts)).geometria;
  }

  async calcularComTransito(origem: LatLon, destino: LatLon, opts: RunOptions): Promise<RotaDoTrajeto> {
    let transito = observacaoTransito(null, MOTIVO_SEM_TOMTOM);
    if (this.tomtom) {
      try {
        const o = await this.runner.execute(this.tomtom, { origem, destino }, opts);
        transito = observacaoTransito(o, '');
        if (o.status !== 'unavailable') {
          const geometria: Geometry = { fonte: 'tomtom', coordenadas: copiar(o.value.coordenadas), distanciaM: o.value.distanciaM };
          return { geometria, transito };
        }
      } catch (err) {
        registrarFalhaInesperada(opts.logger, 'tomtom', err);
        transito = observacaoTransito(null, 'Erro inesperado ao consultar a fonte');
      }
    }
    return { geometria: await this.osrmOuLinhaReta(origem, destino, opts), transito };
  }

  /**
   * Rota do OSRM (`fonte: 'osrm'`, também quando vem do cache vencido: a malha viária quase não muda);
   * se a fonte falhar (timeout, breaker, schema, limite, prazo do briefing), linha reta.
   */
  private async osrmOuLinhaReta(origem: LatLon, destino: LatLon, opts: RunOptions): Promise<Geometry> {
    try {
      const outcome = await this.runner.execute(this.osrm, { origem, destino }, opts);
      if (outcome.status !== 'unavailable') {
        return { fonte: 'osrm', coordenadas: copiar(outcome.value.coordenadas), distanciaM: outcome.value.distanciaM };
      }
    } catch (err) {
      // O runner não lança por falha da fonte; isto cobre o inesperado (ex.: cache externo fora)
      registrarFalhaInesperada(opts.logger, 'osrm', err);
    }
    return linhaReta(origem, destino);
  }
}

function registrarFalhaInesperada(logger: ProviderLogger, provider: string, err: unknown): void {
  try {
    logger.warn(
      { provider, erro: 'inesperado', mensagem: err instanceof Error ? err.message : String(err) },
      'falha inesperada ao calcular a rota',
    );
  } catch {
    // log não pode derrubar o briefing
  }
}
