// TomTom Routing (RF22/RF24): mapeamento das fixtures reais de 13/10/2026 (MASP → Sé), erros sem chave/URL,
// cache e cota pelo runner. Sem rede.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LruCache } from '../../../src/infrastructure/cache/lru-cache.js';
import { HttpStatusError, RateLimitedError } from '../../../src/infrastructure/errors.js';
import { createHttpClient, type FetchFn } from '../../../src/infrastructure/http-client.js';
import { ProviderRunner } from '../../../src/infrastructure/provider-runner.js';
import {
  TOMTOM_SOURCE,
  TomTomRouteResponseSchema,
  createTomTomRotas,
  distanciaM,
  mapearRotaTomTom,
  mascararChave,
} from '../../../src/providers/routing/tomtom.adapter.js';
import { FakeClock, jsonResponse, memoryLogger } from '../../infrastructure/helpers.js';

const fixture = (nome: string) => JSON.parse(readFileSync(new URL(`./fixtures/${nome}.json`, import.meta.url), 'utf8'));
const CARRO = fixture('tomtom-rota-carro-2026-10-13');
const A_PE = fixture('tomtom-rota-a-pe-2026-10-13');
const CHAVE = 'chave-de-teste-123/+=';
const MASP = { lat: -23.5614961, lon: -46.6559677 };
const SE = { lat: -23.5503898, lon: -46.633081 };

function setup(fetch: FetchFn) {
  const clock = new FakeClock(Date.parse('2026-10-13T22:38:37-03:00'));
  const urls: string[] = [];
  const contando: FetchFn = (input, init) => {
    urls.push(String(input));
    return fetch(input, init);
  };
  const rotas = createTomTomRotas({ chave: CHAVE, http: createHttpClient({ fetch: contando }), clock });
  const runner = new ProviderRunner({
    cache: new LruCache({ clock }),
    clock,
    rateLimiters: { [TOMTOM_SOURCE]: rotas.limiter },
  });
  return { clock, rotas, runner, urls, logger: memoryLogger() };
}

describe('mapeamento (fixtures reais de 13/10/2026)', () => {
  it('carro: geometria [lon, lat], distância, tempos com e sem trânsito, sem seções de trânsito às 22h38', () => {
    const rota = mapearRotaTomTom(TomTomRouteResponseSchema.parse(CARRO));
    expect(rota.coordenadas).toHaveLength(173);
    expect(rota.coordenadas[0]).toEqual([-46.65615, -23.56168]);
    expect(rota).toMatchObject({ distanciaM: 4073, duracaoS: 597, duracaoLivreS: 586, atrasoS: 0, trechosLentos: [] });
  });

  it('a pé: 3,15 km em 37 min 48 s; seção TRAVEL_MODE não vira trecho lento', () => {
    const rota = mapearRotaTomTom(TomTomRouteResponseSchema.parse(A_PE));
    expect(rota).toMatchObject({ distanciaM: 3150, duracaoS: 2268, duracaoLivreS: 2268, atrasoS: 0, trechosLentos: [] });
    expect(rota.coordenadas).toHaveLength(127);
  });

  it('seções TRAFFIC → trechos lentos com comprimento pelos pontos, do maior atraso para o menor', () => {
    // Fixture real + 2 seções no formato da doc (a captura de 22h38 veio sem trânsito)
    const comTransito = structuredClone(CARRO);
    comTransito.routes[0].sections = [
      { startPointIndex: 0, endPointIndex: 172, sectionType: 'TRAVEL_MODE', travelMode: 'car' },
      { startPointIndex: 10, endPointIndex: 20, sectionType: 'TRAFFIC', simpleCategory: 'JAM', delayInSeconds: 45, magnitudeOfDelay: 1 },
      { startPointIndex: 50, endPointIndex: 80, sectionType: 'TRAFFIC', simpleCategory: 'JAM', delayInSeconds: 300, magnitudeOfDelay: 3 },
    ];
    const rota = mapearRotaTomTom(TomTomRouteResponseSchema.parse(comTransito));
    expect(rota.trechosLentos.map((t) => [t.atrasoS, t.magnitude])).toEqual([
      [300, 3],
      [45, 1],
    ]);
    let esperado = 0;
    for (let i = 50; i < 80; i++) esperado += distanciaM(rota.coordenadas[i]!, rota.coordenadas[i + 1]!);
    expect(rota.trechosLentos[0]!.comprimentoM).toBe(Math.round(esperado));
    expect(rota.trechosLentos[0]!.comprimentoM).toBeGreaterThan(0);
  });

  it('haversine: 1 grau de latitude ≈ 111,2 km', () => {
    expect(Math.round(distanciaM([0, 0], [0, 1]))).toBe(111_195);
  });
});

describe('chamada e cache pelo runner', () => {
  it('URL com os parâmetros da doc e coordenadas lat,lon com 4 casas; carro com trânsito, a pé sem seções', async () => {
    const { rotas, runner, urls, logger } = setup(async (u) => jsonResponse(String(u).includes('pedestrian') ? A_PE : CARRO));
    await runner.execute(rotas.carro, { origem: MASP, destino: SE }, { logger });
    await runner.execute(rotas.aPe, { origem: MASP, destino: SE }, { logger });
    const [carro, aPe] = urls.map((u) => new URL(u));
    expect(carro!.pathname).toBe('/routing/1/calculateRoute/-23.5615,-46.6560:-23.5504,-46.6331/json');
    expect(Object.fromEntries(carro!.searchParams)).toMatchObject({
      key: CHAVE,
      travelMode: 'car',
      traffic: 'true',
      routeType: 'fastest',
      computeTravelTimeFor: 'all',
      sectionType: 'traffic',
    });
    expect(aPe!.searchParams.get('travelMode')).toBe('pedestrian');
    expect(aPe!.searchParams.has('sectionType')).toBe(false);
  });

  it('cache: carro vale 5 min e a pé 1 dia, por par arredondado (~11 m)', async () => {
    const { rotas, runner, urls, logger, clock } = setup(async (u) => jsonResponse(String(u).includes('pedestrian') ? A_PE : CARRO));
    const perto = { lat: MASP.lat + 0.00002, lon: MASP.lon - 0.00002 };
    await runner.execute(rotas.carro, { origem: MASP, destino: SE }, { logger });
    expect((await runner.execute(rotas.carro, { origem: perto, destino: SE }, { logger })).cache).toBe('hit');
    await runner.execute(rotas.aPe, { origem: MASP, destino: SE }, { logger });
    expect(urls).toHaveLength(2);
    clock.advance(5 * 60_000 + 1);
    expect((await runner.execute(rotas.carro, { origem: MASP, destino: SE }, { logger })).cache).toBe('miss');
    expect((await runner.execute(rotas.aPe, { origem: MASP, destino: SE }, { logger })).cache).toBe('hit');
    expect(urls).toHaveLength(3);
  });
});

describe('erros sem URL nem chave', () => {
  it('403: motivo humano; nada da chave no erro, no motivo nem no log', async () => {
    const { rotas, runner, logger } = setup(async () =>
      jsonResponse({ detailedError: { code: 'Forbidden', message: `key ${CHAVE} inactive` } }, 403),
    );
    const o = await runner.execute(rotas.carro, { origem: MASP, destino: SE }, { logger });
    expect(o).toMatchObject({ status: 'unavailable', motivo: 'TomTom recusou a chave (HTTP 403)' });
    const tudo = JSON.stringify([o, logger.lines]);
    expect(tudo).not.toContain(CHAVE);
    expect(tudo).not.toContain(encodeURIComponent(CHAVE));
  });

  it('erro direto do adaptador: HttpStatusError com URL mascarada', async () => {
    const { rotas } = setup(async () => jsonResponse('Service Unavailable', 503));
    const erro = await rotas.carro.fetch({ origem: MASP, destino: SE }, { signal: new AbortController().signal }).catch((e) => e);
    expect(erro).toBeInstanceOf(HttpStatusError);
    expect(erro.url).toContain('key=***');
    expect(erro.extra.motivo).toBe('TomTom fora do ar (HTTP 503)');
    expect(JSON.stringify({ ...erro, message: erro.message })).not.toContain(encodeURIComponent(CHAVE));
  });

  it('400 (pontos sem ligação viária) → motivo de rota não encontrada', async () => {
    const { rotas, runner, logger } = setup(async () => jsonResponse({ detailedError: { code: 'MAP_MATCHING_FAILURE' } }, 400));
    const o = await runner.execute(rotas.aPe, { origem: MASP, destino: SE }, { logger });
    expect(o.motivo).toBe('TomTom não encontrou rota entre os pontos (HTTP 400)');
  });

  it('falha de rede com a URL na mensagem → mensagem mascarada no log', async () => {
    const { rotas, runner, logger } = setup(async (u) => {
      throw new TypeError(`Failed to parse URL from ${String(u)}`);
    });
    await runner.execute(rotas.carro, { origem: MASP, destino: SE }, { logger });
    expect(JSON.stringify(logger.lines)).not.toContain(encodeURIComponent(CHAVE));
    expect(JSON.stringify(logger.lines)).toContain('key=***');
  });

  it('429 com Retry-After: bloqueia a cota até lá sem chamar a fonte (não conta no breaker)', async () => {
    let chamadas = 0;
    const { rotas, runner, logger, clock } = setup(async () => {
      chamadas++;
      return new Response('{}', { status: 429, headers: { 'retry-after': '120' } });
    });
    const o = await runner.execute(rotas.carro, { origem: MASP, destino: SE }, { logger });
    expect(o).toMatchObject({ status: 'unavailable', erro: 'rate-limited', motivo: 'Limite de consultas à fonte atingido' });
    await expect(rotas.limiter.acquire()).rejects.toBeInstanceOf(RateLimitedError);
    clock.advance(119_000);
    await runner.execute(rotas.carro, { origem: SE, destino: MASP }, { logger });
    expect(chamadas).toBe(1);
    expect(runner.breakerFor(TOMTOM_SOURCE).state).toBe('closed');
    clock.advance(1_000);
    await runner.execute(rotas.carro, { origem: SE, destino: MASP }, { logger });
    expect(chamadas).toBe(2);
  });

  it('resposta fora do formato → schema (unavailable)', async () => {
    const { rotas, runner, logger } = setup(async () => jsonResponse({ routes: [] }));
    expect((await runner.execute(rotas.carro, { origem: MASP, destino: SE }, { logger })).erro).toBe('schema');
  });

  it('mascararChave troca a forma crua e a codificada', () => {
    expect(mascararChave(`a=${CHAVE}&b=${encodeURIComponent(CHAVE)}`, CHAVE)).toBe('a=***&b=***');
    expect(mascararChave('sem nada', '')).toBe('sem nada');
  });
});
