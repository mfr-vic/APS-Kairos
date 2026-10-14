// Apoio aos testes do briefing (T27): "reais" falsos com os nomes de fonte verdadeiros, montados sobre os
// simulados (mesmos valores dos cenários), um provedor lento e um banco fora do ar. Sem rede.
import type { Dimension, RailLine, TrajetoRequest } from '@kairos/contracts';
import { LruCache } from '../../../src/infrastructure/cache/lru-cache.js';
import { ProviderNetworkError } from '../../../src/infrastructure/errors.js';
import type { HttpClient } from '../../../src/infrastructure/http-client.js';
import { ProviderRunner } from '../../../src/infrastructure/provider-runner.js';
import type { DimensionProvider, Provider } from '../../../src/infrastructure/provider.js';
import { BriefingService, type BriefingServiceOptions, type ProvedoresReais } from '../../../src/modules/briefing/briefing.service.js';
import { CenarioAtivo, type NomeCenario } from '../../../src/modules/demo/index.js';
import { FloodRiskService, type Queryable } from '../../../src/modules/flood-risk/index.js';
import { RouteGeometryService } from '../../../src/modules/routing/route-geometry.service.js';
import { GeoSampaFloodAdapter } from '../../../src/providers/flood/geosampa-flood.adapter.js';
import type { RotaInput, RotaOsrm } from '../../../src/providers/routing/osrm.adapter.js';
import type { RotaTomTom } from '../../../src/providers/routing/tomtom.adapter.js';
import { criarProvedoresSimulados } from '../../../src/providers/simulated/index.js';
import { FakeClock, memoryLogger } from '../../infrastructure/helpers.js';
import { AGORA_MS } from '../demo/helpers.js';

export { AGORA_MS };

/** Exemplo do contrato (packages/contracts/examples/briefing-request.json), já com os defaults. */
export const TRAJETO: TrajetoRequest = {
  origem: { lat: -23.5614961, lon: -46.6559677, rotulo: 'MASP' },
  destino: { lat: -23.5503898, lon: -46.633081, rotulo: 'Praça da Sé' },
  onibus: [{ codigoLinha: 609, letreiro: '875A-10', codigoParada: 260016861 }],
  trilhos: ['L4'],
};

/** Envolve um provedor trocando o `source` (ex.: simulado → "open-meteo") e contando chamadas. */
export function comFonte<I, D extends Dimension>(p: DimensionProvider<unknown, D>, source: string, timeoutMs?: number) {
  const fake = {
    dimension: p.dimension,
    source,
    ttlSeconds: p.ttlSeconds,
    timeoutMs: timeoutMs ?? p.timeoutMs,
    chamadas: 0,
    cacheKey: (i: I) => p.cacheKey(i),
    fetch: (i: I, ctx: Parameters<typeof p.fetch>[1]) => {
      fake.chamadas++;
      return p.fetch(i, ctx);
    },
  };
  return fake;
}

/** Como `comFonte`, mas também troca a `fonte` de cada linha (o simulado marca "simulado:…"). */
export function trilhosComFonte(p: DimensionProvider<unknown, 'rail'>, source: string) {
  const fake = comFonte<RailLine[], 'rail'>(p, source);
  const original = fake.fetch;
  fake.fetch = async (i, ctx) => {
    const r = await original(i, ctx);
    return { ...r, value: { linhas: r.value.linhas.map((l) => ({ ...l, fonte: source })) } };
  };
  return fake;
}

/** Reais falsos com os sources verdadeiros; o comportamento vem de `cenarioReais` (padrão: normal). */
export function reaisFalsos(clock: FakeClock, cenarioReais = new CenarioAtivo(clock, 'normal')) {
  const sim = criarProvedoresSimulados(cenarioReais, clock);
  return {
    cenarioReais,
    reais: {
      weather: comFonte(sim.weather, 'open-meteo'),
      air: comFonte(sim.air, 'open-meteo-air-quality'),
      bus: comFonte(sim.bus, 'sptrans-olhovivo'),
      // O real recebe RailLine[]; o simulado não reconhece array e devolve todas as linhas (o serviço recorta)
      rail: trilhosComFonte(sim.rail, 'metro-sp'),
      flood: comFonte(sim.flood, 'geosampa'),
    },
  };
}

/** Banco fora do ar: toda consulta falha como o pg falha sem conexão. */
export const bancoFora: Queryable = {
  query: async () => {
    throw new Error('connect ECONNREFUSED 127.0.0.1:5432');
  },
};

export function floodComBancoFora() {
  return new GeoSampaFloodAdapter(new FloodRiskService(bancoFora));
}

/** OSRM falso: rota fixa de 3 pontos, ou falha (→ linha reta). */
export function osrmFalso(falhar = true): Provider<RotaInput, RotaOsrm> {
  return {
    source: 'osrm',
    ttlSeconds: 60,
    cacheKey: (i) => JSON.stringify(i),
    fetch: async ({ origem, destino }) => {
      if (falhar) throw new ProviderNetworkError('sem rede no teste');
      return {
        value: {
          coordenadas: [
            [origem.lon, origem.lat],
            [-46.64, -23.555],
            [destino.lon, destino.lat],
          ],
          distanciaM: 3000,
          duracaoS: 600,
        },
      };
    },
  };
}

/** TomTom falsa (carro): rota de 3 pontos, 4 km, 11 min com trânsito / 10 min livre; ou falha (→ OSRM). */
export function tomtomFalsa(
  o: { falhar?: boolean; atrasoS?: number } = {},
): Provider<RotaInput, RotaTomTom> & { chamadas: number } {
  const fake = {
    source: 'tomtom',
    ttlSeconds: 300,
    chamadas: 0,
    cacheKey: (i: RotaInput) => JSON.stringify(i),
    fetch: async ({ origem, destino }: RotaInput) => {
      fake.chamadas++;
      if (o.falhar) throw new ProviderNetworkError('sem rede no teste');
      const atrasoS = o.atrasoS ?? 60;
      return {
        value: {
          coordenadas: [
            [origem.lon, origem.lat],
            [-46.645, -23.556],
            [destino.lon, destino.lat],
          ] as [number, number][],
          distanciaM: 4000,
          duracaoS: 600 + atrasoS,
          duracaoLivreS: 600,
          atrasoS,
          trechosLentos: [],
        },
      };
    },
  };
  return fake;
}

/** HttpClient que nunca chega à rede (qualquer adaptador real fica `unavailable`). */
export const httpSemRede: HttpClient = {
  requestText: async () => {
    throw new ProviderNetworkError('sem rede no teste');
  },
  requestBytes: async () => {
    throw new ProviderNetworkError('sem rede no teste');
  },
  requestJson: async () => {
    throw new ProviderNetworkError('sem rede no teste');
  },
};

export interface MontarOpcoes {
  reais?: Partial<ProvedoresReais>;
  osrmFalha?: boolean;
  /** Padrão: TomTom falsa respondendo; null = sem TOMTOM_KEY. */
  tomtom?: Provider<RotaInput, RotaTomTom> | null;
  demoMode?: boolean;
  cenarioDemo?: NomeCenario;
  cenarioReais?: NomeCenario;
  historico?: BriefingServiceOptions['historico'];
}

export function montarBriefing(o: MontarOpcoes = {}) {
  const clock = new FakeClock(AGORA_MS);
  const runner = new ProviderRunner({ cache: new LruCache({ clock }), clock });
  const { reais, cenarioReais } = reaisFalsos(clock, new CenarioAtivo(clock, o.cenarioReais ?? 'normal'));
  const cenario = new CenarioAtivo(clock, o.cenarioDemo ?? 'real');
  const logger = memoryLogger();
  const tomtom = o.tomtom === undefined ? tomtomFalsa() : o.tomtom;
  const service = new BriefingService({
    runner,
    clock,
    geometria: new RouteGeometryService(runner, osrmFalso(o.osrmFalha ?? true), tomtom),
    reais: { ...reais, ...o.reais },
    demo: { demoMode: o.demoMode ?? false, cenario, simulados: criarProvedoresSimulados(cenario, clock) },
    historico: o.historico,
  });
  return { clock, runner, reais, cenarioReais, cenario, logger, service, tomtom };
}
