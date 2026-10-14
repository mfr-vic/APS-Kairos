// BriefingService (T27, RF05, RF15): fan-out das 6 dimensões com prazo global de 4 s (C.5) → regras → contrato.
// Fluxo: rota TomTom (geometria + trânsito; sem ela, OSRM ou linha reta) → alagamento sobre a geometria, em
// paralelo com clima, ar, ônibus e trilhos.
// Nada aqui lança por falha de fonte: o runner devolve `unavailable` (ou `stale` com cache vencido).
import { randomUUID } from 'node:crypto';
import {
  BriefingResponseSchema,
  LINHAS_ARTESP,
  type BriefingResponse,
  type DataState,
  type Dimension,
  type Geometry,
  type LatLon,
  type Observation,
  type RailLine,
  type TrajetoRequest,
} from '@kairos/contracts';
import type { Clock } from '../../infrastructure/clock.js';
import type { ProviderLogger, ProviderRunner, RunOptions } from '../../infrastructure/provider-runner.js';
import type { DimensionProvider, ObservationOf } from '../../infrastructure/provider.js';
import { ARTESP_SOURCE } from '../../providers/rail/artesp.adapter.js';
import { ATRIBUICAO_TOMTOM, TOMTOM_SOURCE, TOMTOM_TTL_CARRO_S } from '../../providers/routing/tomtom.adapter.js';
import {
  METRO_SP_SOURCE,
  filtrarLinhas,
  observarLinhasMetroSp,
  separarCobertura,
} from '../../providers/rail/metro-sp.adapter.js';
import { PREFIXO_SIMULADO, type ProvedoresSimulados } from '../../providers/simulated/index.js';
import type { PrevisaoParadaInput } from '../../providers/transit/olhovivo.adapter.js';
import { OLHO_VIVO_SOURCE } from '../../providers/transit/olhovivo.client.js';
import type { CenarioAtivo } from '../demo/cenario-ativo.js';
import { selecionarProvedores } from '../demo/selecionar-provedores.js';
import type { Coordenada } from '../flood-risk/index.js';
import type { RouteGeometryService } from '../routing/route-geometry.service.js';
import { calcularConfianca, calcularJanelaMeteorologica, calcularVeredito } from '../rules/index.js';

/** C.5: prazo global do briefing. */
export const PRAZO_BRIEFING_MS = 4_000;

export const ATRIBUICAO_SIMULADO = 'Dados simulados (modo demonstração)';

/** Atribuição exigida por fonte (só entra quando a fonte contribuiu com dado na resposta). */
export const ATRIBUICAO_POR_FONTE: Record<string, string> = {
  'open-meteo': 'Open-Meteo / CAMS',
  'open-meteo-air-quality': 'Open-Meteo / CAMS',
  [OLHO_VIVO_SOURCE]: 'SPTrans',
  [METRO_SP_SOURCE]: 'Direto do Metrô (metro.sp.gov.br)',
  geosampa: 'GeoSampa',
  [ARTESP_SOURCE]: 'ARTESP (CC BY-NC 4.0)',
  [TOMTOM_SOURCE]: ATRIBUICAO_TOMTOM,
};

export interface ProvedoresReais {
  weather: DimensionProvider<LatLon, 'weather'>;
  air: DimensionProvider<LatLon, 'air'>;
  /** null sem SPTRANS_TOKEN: ônibus fica `unavailable` sem chamar a fonte. */
  bus: DimensionProvider<PrevisaoParadaInput, 'bus'> | null;
  /** Página do Metrô (sempre): 1, 2, 3, 15 e, sem chave ARTESP ou com ela fora, 4 e 5. */
  rail: DimensionProvider<RailLine[], 'rail'>;
  /** ARTESP (4–9); null/ausente sem ARTESP_KEY. */
  artesp?: DimensionProvider<RailLine[], 'rail'> | null;
  flood: DimensionProvider<Coordenada[], 'flood'>;
}

export interface BriefingServiceOptions {
  /** O runner único do app. */
  runner: ProviderRunner;
  clock: Clock;
  geometria: RouteGeometryService;
  reais: ProvedoresReais;
  demo: { demoMode: boolean; cenario: CenarioAtivo; simulados: ProvedoresSimulados };
  prazoMs?: number;
  /** Histórico (RF26); só briefings com fontes reais (o modo demo não polui a disponibilidade). */
  historico?: { registrar(trajeto: TrajetoRequest, resposta: BriefingResponse, latenciaMs: number): Promise<void> };
}

function indisponivel<D extends Dimension>(dimension: D, source: string, ttlSeconds: number, motivo: string) {
  return { dimension, source, status: 'unavailable', observedAt: null, fetchedAt: null, ttlSeconds, value: null, motivo } as Extract<
    Observation,
    { dimension: D }
  >;
}

export class BriefingService {
  private readonly prazoMs: number;

  constructor(private readonly o: BriefingServiceOptions) {
    this.prazoMs = o.prazoMs ?? PRAZO_BRIEFING_MS;
  }

  async gerar(trajeto: TrajetoRequest, logger: ProviderLogger): Promise<BriefingResponse> {
    const { runner, reais, demo } = this.o;
    const inicio = performance.now();
    // O cenário muda em tempo de execução: a escolha real × simulado é por requisição
    const simulado = selecionarProvedores({ demoMode: demo.demoMode, cenario: demo.cenario, reais: false, simulados: true });
    const sim = demo.simulados;

    // setTimeout (e não AbortSignal.timeout) para os testes controlarem o prazo com fake timers
    const prazo = new AbortController();
    const timer = setTimeout(() => prazo.abort(), this.prazoMs);
    const opts: RunOptions = { logger, signal: prazo.signal };
    const ponto: LatLon = { lat: trajeto.origem.lat, lon: trajeto.origem.lon }; // clima e ar: a origem (T17)

    try {
      const weather: ProvedoresReais['weather'] = simulado ? sim.weather : reais.weather;
      const air: ProvedoresReais['air'] = simulado ? sim.air : reais.air;
      const flood: ProvedoresReais['flood'] = simulado ? sim.flood : reais.flood;
      // Uma chamada TomTom dá a geometria (alagamento) e a dimensão `traffic` (RF22)
      const rotaP = this.o.geometria.calcularComTransito(trajeto.origem, trajeto.destino, opts);
      const geometriaP = rotaP.then((r) => r.geometria);
      const tarefas: [Dimension, string, number, Promise<Observation>][] = [
        tarefa('weather', weather, runner.observe(weather, ponto, opts)),
        tarefa('air', air, runner.observe(air, ponto, opts)),
        tarefa('flood', flood, geometriaP.then((g) => runner.observe(flood, (g.coordenadas ?? []) as Coordenada[], opts))),
        simulado
          ? tarefa('traffic', sim.traffic, runner.observe(sim.traffic, trajeto, opts))
          : tarefa('traffic', { source: TOMTOM_SOURCE, ttlSeconds: TOMTOM_TTL_CARRO_S }, rotaP.then((r) => r.transito)),
      ];
      if (trajeto.onibus.length > 0) {
        const bus: ProvedoresReais['bus'] = simulado ? sim.bus : reais.bus;
        const entrada: PrevisaoParadaInput = { codigoParada: trajeto.onibus[0]!.codigoParada, linhas: trajeto.onibus };
        tarefas.push([
          'bus',
          bus?.source ?? OLHO_VIVO_SOURCE,
          30,
          bus
            ? runner.observe(bus, entrada, opts)
            : Promise.resolve(indisponivel('bus', OLHO_VIVO_SOURCE, 30, 'Olho Vivo não configurado no servidor (sem SPTRANS_TOKEN)')),
        ]);
      }
      if (trajeto.trilhos.length > 0) {
        tarefas.push(tarefa('rail', simulado ? sim.rail : reais.rail, this.trilhos(trajeto.trilhos, simulado, opts)));
      }

      const resultados = await Promise.allSettled(tarefas.map((t) => t[3]));
      const observacoes = resultados.map((r, i): Observation => {
        if (r.status === 'fulfilled') return r.value;
        const [dimension, source, ttl] = tarefas[i]!;
        logger.warn({ dimension, erro: 'inesperado', mensagem: String(r.reason) }, 'falha inesperada no briefing');
        return indisponivel(dimension, source, ttl, 'Erro inesperado ao consultar a fonte');
      });
      const geometria: Geometry = await geometriaP;

      const agora = new Date(this.o.clock.now());
      const { veredito, motivos } = calcularVeredito(observacoes, trajeto, agora);
      const resposta = BriefingResponseSchema.parse({
        briefingId: randomUUID(),
        geradoEm: agora.toISOString(),
        veredito,
        motivos,
        janelaMeteorologica: calcularJanelaMeteorologica(observacoes, agora),
        confianca: calcularConfianca(observacoes, trajeto),
        observacoes,
        geometria,
        atribuicoes: atribuicoes(observacoes, geometria),
      });
      const historico = this.o.historico;
      if (historico && !simulado) {
        const latenciaMs = performance.now() - inicio;
        // Fora do caminho crítico (RF26): sem await; banco fora só gera log, o briefing segue 200
        Promise.resolve()
          .then(() => historico.registrar(trajeto, resposta, latenciaMs))
          .catch((err: unknown) => logger.warn({ erro: String(err) }, 'falha ao registrar o briefing no histórico'));
      }
      return resposta;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Real (T19): com chave ARTESP, 4–9 → ARTESP e 1, 2, 3, 15 → página do Metrô; sem chave, a página cobre
   * 1–5 e 15. Linhas sem nenhuma fonte não chamam nada; se nenhuma tiver fonte, `unavailable`.
   */
  private async trilhos(vinculadas: RailLine[], simulado: boolean, opts: RunOptions): Promise<Observation> {
    const { runner, reais, demo } = this.o;
    if (simulado) return runner.observe(demo.simulados.rail, { trilhos: vinculadas }, opts);
    const artesp = reais.artesp ?? null;
    const unicas = [...new Set(vinculadas)];
    const daArtesp = artesp ? unicas.filter((l) => COBERTAS_ARTESP.has(l)) : [];
    const doMetro = separarCobertura(unicas.filter((l) => !daArtesp.includes(l))).cobertas;
    // shortcut: com linhas cobertas, as sem fonte (CPTM 10–13; sem chave, também 6–9) somem da resposta
    // (RailValue não tem estado "sem fonte" por linha); limitação registrada na B.11, trabalho futuro.
    if (daArtesp.length === 0 && doMetro.length === 0) {
      const nomes = unicas.map((l) => l.slice(1)).join(', ');
      const p = artesp ?? reais.rail;
      return indisponivel('rail', p.source, p.ttlSeconds, `Sem fonte configurada para a(s) linha(s) ${nomes}`);
    }

    const partes: ObservationOf<'rail'>[] = [];
    const [obsArtesp, obsMetro] = await Promise.all([
      daArtesp.length > 0 ? observarLinhas(runner, artesp!, daArtesp, opts) : null,
      doMetro.length > 0 ? observarLinhasMetroSp(runner, reais.rail, doMetro, opts) : null,
    ]);
    if (obsArtesp) partes.push(obsArtesp);
    if (obsMetro) partes.push(obsMetro);
    // Tolerância a falhas por fonte alternativa: ARTESP sem dado → 4 e 5 vêm da página do Metrô (que também
    // as publica). A página tem cacheKey fixa, então isso costuma ser cache hit da leitura acima.
    const resgatar = obsArtesp?.value === null ? separarCobertura(daArtesp).cobertas : [];
    if (resgatar.length > 0) partes.push(await observarLinhasMetroSp(runner, reais.rail, resgatar, opts));
    return comporTrilhos(partes, unicas);
  }
}

const COBERTAS_ARTESP: ReadonlySet<RailLine> = new Set(LINHAS_ARTESP);

/** Executa um provedor de trilhos pelo runner e recorta o valor para as linhas pedidas. */
async function observarLinhas(
  runner: ProviderRunner,
  provider: DimensionProvider<RailLine[], 'rail'>,
  linhas: RailLine[],
  opts: RunOptions,
): Promise<ObservationOf<'rail'>> {
  const obs = await runner.observe(provider, linhas, opts);
  return obs.value === null ? obs : { ...obs, value: filtrarLinhas(obs.value, linhas) };
}

const ORDEM_STATUS: Record<DataState, number> = { fresh: 0, stale: 1, unavailable: 2 };
const NOME_FONTE: Record<string, string> = { artesp: 'ARTESP', [METRO_SP_SOURCE]: 'Direto do Metrô' };

/**
 * Junta as observações de trilhos de várias fontes numa só (T19). Cada linha leva a sua `fonte`.
 * - uma parte só → ela mesma;
 * - com dado: `source` = fontes que contribuíram ("artesp+metro-sp"), `status` = o pior entre elas,
 *   `observedAt`/`fetchedAt`/`ttlSeconds` da mais antiga; uma linha pedida a mais de uma fonte fica com a
 *   primeira que trouxe dado; fonte que falhou sem resgate vira `motivo` (as linhas dela somem — B.11);
 * - sem dado nenhum → `unavailable` com os motivos de cada fonte.
 */
export function comporTrilhos(partes: readonly ObservationOf<'rail'>[], ordem: readonly RailLine[]): ObservationOf<'rail'> {
  if (partes.length === 1) return partes[0]!;
  const comDado = partes.filter((p) => p.value !== null);
  const vistas = new Set<RailLine>();
  const linhas = comDado
    .flatMap((p) => p.value!.linhas)
    .filter((l) => !vistas.has(l.linha) && vistas.add(l.linha))
    .sort((a, b) => ordem.indexOf(a.linha) - ordem.indexOf(b.linha));
  const falhas = [
    ...new Set(
      partes
        .filter((p) => p.value === null && !comDado.some((c) => c.source === p.source))
        .map((p) => `${NOME_FONTE[p.source] ?? p.source}: ${p.motivo ?? 'sem dado'}`),
    ),
  ];

  if (comDado.length === 0) {
    const base = partes[0]!;
    return { ...base, source: [...new Set(partes.map((p) => p.source))].join('+'), motivo: falhas.join('; ') };
  }
  const maisAntiga = [...comDado].sort((a, b) => Date.parse(a.observedAt!) - Date.parse(b.observedAt!))[0]!;
  const pior = comDado.reduce((a, b) => (ORDEM_STATUS[b.status] > ORDEM_STATUS[a.status] ? b : a));
  const motivos = [...comDado.map((p) => p.motivo).filter((m): m is string => !!m), ...falhas];
  return {
    dimension: 'rail',
    source: [...new Set(comDado.map((p) => p.source))].join('+'),
    status: pior.status,
    observedAt: maisAntiga.observedAt,
    fetchedAt: maisAntiga.fetchedAt,
    ttlSeconds: maisAntiga.ttlSeconds,
    value: { linhas },
    ...(motivos.length > 0 ? { motivo: motivos.join('; ') } : {}),
  };
}

function tarefa(
  dimension: Dimension,
  provider: { source: string; ttlSeconds: number },
  promessa: Promise<Observation>,
): [Dimension, string, number, Promise<Observation>] {
  return [dimension, provider.source, provider.ttlSeconds, promessa];
}

/** Só as fontes que contribuíram com dado (fresh/stale; nos trilhos, a `fonte` de cada linha) e a da rota. */
export function atribuicoes(observacoes: readonly Observation[], geometria: Geometry): string[] {
  const lista = new Set<string>();
  for (const o of observacoes) {
    if (o.value === null) continue;
    const fontes = o.dimension === 'rail' ? o.value.linhas.map((l) => l.fonte) : [o.source];
    for (const fonte of fontes) {
      if (fonte.startsWith(PREFIXO_SIMULADO)) lista.add(ATRIBUICAO_SIMULADO);
      else if (ATRIBUICAO_POR_FONTE[fonte]) lista.add(ATRIBUICAO_POR_FONTE[fonte]!);
    }
  }
  if (geometria.fonte === 'osrm') lista.add('© OpenStreetMap');
  if (geometria.fonte === 'tomtom') lista.add(ATRIBUICAO_TOMTOM);
  return [...lista];
}
