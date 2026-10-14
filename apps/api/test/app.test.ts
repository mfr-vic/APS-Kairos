import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  BriefingResponseSchema,
  HealthSchema,
  ProblemDetailsSchema,
  ProvidersHealthResponseSchema,
} from '@kairos/contracts';
import { buildApp } from '../src/app.js';
import { createHttpClient } from '../src/infrastructure/http-client.js';
import { hangingFetch } from './infrastructure/helpers.js';
import { bancoFora, httpSemRede } from './modules/briefing/helpers.js';

// Sem rede e sem banco: os adaptadores reais ficam unavailable
const app = buildApp({ deps: { http: httpSemRede, db: bancoFora } });
afterAll(() => app.close());

const examplePath = fileURLToPath(
  new URL('../../../packages/contracts/examples/briefing-request.json', import.meta.url),
);
const validRequest = JSON.parse(readFileSync(examplePath, 'utf8'));

describe('API v1', () => {
  it('GET /v1/health segue o contrato', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(HealthSchema.safeParse(res.json()).success).toBe(true);
  });

  it('GET /v1/health/providers não inventa latências', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/health/providers' });
    const body = ProvidersHealthResponseSchema.parse(res.json());
    expect(body.providers.every((p) => p.latencyMs === null && p.status === 'desconhecido')).toBe(true);
  });

  it('POST /v1/briefings com o exemplo válido devolve 200 no contrato', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/briefings', payload: validRequest });
    expect(res.statusCode).toBe(200);
    expect(BriefingResponseSchema.safeParse(res.json()).success).toBe(true);
  });

  it('registra as rotas de trilhos, geocode, ônibus, clima e demo (404 com DEMO_MODE=false)', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/transit/rail/lines' })).json().linhas).toHaveLength(6);
    expect((await app.inject({ method: 'GET', url: '/v1/weather?lat=200' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/v1/geocode?q=a' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/v1/transit/bus/lines' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/v1/demo/scenario' })).statusCode).toBe(404);
  });

  it('POST /v1/briefings com lat = 200 e sem destino devolve 400 problem+json (TC21)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/briefings',
      payload: { trajeto: { origem: { lat: 200, lon: -46.6 } } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    const problem = ProblemDetailsSchema.parse(res.json());
    expect(problem.status).toBe(400);
    expect(problem.errors?.map((e) => e.path)).toEqual(
      expect.arrayContaining(['trajeto.origem.lat', 'trajeto.destino']),
    );
  });
});

describe('com ARTESP_KEY (T19)', () => {
  const STATUS = readFileSync(fileURLToPath(new URL('./providers/rail/fixtures/artesp-status-2026-10-13.json', import.meta.url)), 'utf8');
  function appComArtesp(segundoPlano = false) {
    const hosts: string[] = [];
    const http = createHttpClient({
      fetch: async (input) => {
        const url = new URL(String(input));
        hosts.push(url.host);
        if (url.host === 'ccm.artesp.sp.gov.br') {
          // meta.timestamp = agora (hora local de SP), como a fonte real responde
          const agora = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 23);
          return new Response(STATUS.replace('2026-10-13T15:04:40.914266', agora), { status: 200 });
        }
        throw new Error('sem rede no teste');
      },
    });
    return { hosts, app: buildApp({ config: { artespKey: 'chave-falsa', segundoPlano }, deps: { http, db: bancoFora } }) };
  }

  it('linhas 1–9 e 15; briefing com L8 da ARTESP; health mostra o que o runner mediu', async () => {
    const { app: a, hosts } = appComArtesp();
    const linhas = (await a.inject({ method: 'GET', url: '/v1/transit/rail/lines' })).json().linhas;
    expect(linhas.map((l: { linha: string }) => l.linha)).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L15']);

    const res = await a.inject({ method: 'POST', url: '/v1/briefings', payload: { trajeto: { ...validRequest.trajeto, trilhos: ['L8'] } } });
    const b = BriefingResponseSchema.parse(res.json());
    const rail = b.observacoes.find((o) => o.dimension === 'rail');
    expect(rail).toMatchObject({ source: 'artesp', status: 'fresh' });
    expect(rail?.value?.linhas[0]).toMatchObject({ linha: 'L8', situacao: 'ALTERADA', fonte: 'artesp', detalhe: expect.stringMatching(/Barueri/) });
    expect(b.atribuicoes).toContain('ARTESP (CC BY-NC 4.0)');
    expect(hosts.filter((h) => h === 'ccm.artesp.sp.gov.br')).toHaveLength(1);

    const saude = ProvidersHealthResponseSchema.parse((await a.inject({ method: 'GET', url: '/v1/health/providers' })).json());
    expect(saude.providers.find((p) => p.name === 'artesp')).toMatchObject({ status: 'ok', requestCount: 1, successCount: 1 });
    await a.close();
  });

  it('aquecimento faz 1 chamada à ARTESP e a renovação antecipada não a repete', async () => {
    const { app: a, hosts } = appComArtesp(true);
    await a.ready();
    await vi.waitFor(() => expect(hosts).toContain('ccm.artesp.sp.gov.br'));
    // Briefing logo depois: cache hit, sem nova chamada
    await a.inject({ method: 'POST', url: '/v1/briefings', payload: { trajeto: { ...validRequest.trajeto, trilhos: ['L9'] } } });
    expect(hosts.filter((h) => h === 'ccm.artesp.sp.gov.br')).toHaveLength(1);
    await a.close();
  });
});

describe('com TOMTOM_KEY (RF22/RF24, 14/10/2026)', () => {
  const CHAVE = 'chave-tomtom-falsa-XYZ';
  const fixture = (n: string) => readFileSync(fileURLToPath(new URL(`./providers/routing/fixtures/${n}`, import.meta.url)));
  const CARRO = fixture('tomtom-rota-carro-2026-10-13.json');
  const A_PE = fixture('tomtom-rota-a-pe-2026-10-13.json');
  const PNG = fixture('tomtom-tile-14-6069-9295.png');

  function appComTomTom() {
    const caminhos: string[] = [];
    const logs: string[] = [];
    const http = createHttpClient({
      fetch: async (input) => {
        const url = new URL(String(input));
        if (url.host !== 'api.tomtom.com') throw new Error('sem rede no teste');
        caminhos.push(url.pathname);
        if (url.pathname.startsWith('/traffic/')) return new Response(PNG, { status: 200 });
        return new Response(url.searchParams.get('travelMode') === 'pedestrian' ? A_PE : CARRO, { status: 200 });
      },
    });
    const stream = { write: (linha: string) => void logs.push(linha) };
    const a = buildApp({ server: { logger: { level: 'info', stream } }, config: { tomtomKey: CHAVE }, deps: { http, db: bancoFora } });
    return { app: a, caminhos, logs };
  }

  it('briefing com geometria e trânsito da TomTom; rota a pé e de carro; tile; health; a chave não sai', async () => {
    const { app: a, caminhos, logs } = appComTomTom();
    const respostas: string[] = [];

    const res = await a.inject({ method: 'POST', url: '/v1/briefings', payload: validRequest });
    respostas.push(res.body);
    const b = BriefingResponseSchema.parse(res.json());
    expect(b.geometria).toMatchObject({ fonte: 'tomtom', distanciaM: 4073 });
    expect(b.observacoes.find((o) => o.dimension === 'traffic')).toMatchObject({ source: 'tomtom', status: 'fresh', value: { nivel: 'LIVRE' } });
    expect(b.atribuicoes).toContain('© TomTom');

    const pe = await a.inject({ method: 'GET', url: '/v1/rota?de=-23.5614961,-46.6559677&para=-23.5503898,-46.633081&modo=a-pe' });
    respostas.push(pe.body);
    expect(pe.json()).toMatchObject({ modo: 'a-pe', fonte: 'tomtom', distanciaM: 3150 });
    // Carro do mesmo par: cache do briefing (mesma chave arredondada) — sem nova chamada
    const carro = await a.inject({ method: 'GET', url: '/v1/rota?de=-23.5614961,-46.6559677&para=-23.5503898,-46.633081' });
    respostas.push(carro.body);
    expect(carro.json()).toMatchObject({ fonte: 'tomtom', atrasoTransitoS: 0 });

    const tile = await a.inject({ method: 'GET', url: '/v1/mapa/transito/14/6069/9295.png' });
    expect(tile.statusCode).toBe(200);
    expect(tile.headers['content-type']).toBe('image/png');
    respostas.push(JSON.stringify(tile.headers), tile.rawPayload.toString('latin1'));

    const saude = ProvidersHealthResponseSchema.parse((await a.inject({ method: 'GET', url: '/v1/health/providers' })).json());
    expect(saude.providers.find((p) => p.name === 'tomtom')).toMatchObject({ status: 'ok', requestCount: 2, successCount: 2 });
    expect(caminhos.filter((p) => p.startsWith('/routing/'))).toHaveLength(2);
    await a.close();

    const tudo = [...respostas, ...logs].join('\n');
    expect(tudo).not.toContain(CHAVE);
  });

  it('sem chave: rota a pé e tile → 503; traffic unavailable no briefing', async () => {
    const pe = await app.inject({ method: 'GET', url: '/v1/rota?de=-23.56,-46.65&para=-23.55,-46.63&modo=a-pe' });
    expect(pe.statusCode).toBe(503);
    expect((await app.inject({ method: 'GET', url: '/v1/mapa/transito/14/6069/9295.png' })).statusCode).toBe(503);
    const b = BriefingResponseSchema.parse((await app.inject({ method: 'POST', url: '/v1/briefings', payload: validRequest })).json());
    expect(b.observacoes.find((o) => o.dimension === 'traffic')).toMatchObject({ status: 'unavailable', motivo: expect.stringMatching(/TOMTOM_KEY/) });
  });
});

describe('segundoPlano (aquecimento no boot + renovação antecipada)', () => {
  it('fontes travadas não seguram nem derrubam o boot; o close aborta o aquecimento', async () => {
    const chamadas: string[] = [];
    const travado = createHttpClient({
      fetch: (input, init) => {
        chamadas.push(new URL(String(input)).host);
        return hangingFetch()(input, init);
      },
    });
    let consultasBanco = 0;
    const banco = { query: () => (consultasBanco++, new Promise<never>(() => undefined)) };
    const app2 = buildApp({ config: { segundoPlano: true }, deps: { http: travado, db: banco } });
    const inicio = performance.now();
    await app2.ready();
    expect(performance.now() - inicio).toBeLessThan(1_000);
    expect((await app2.inject({ method: 'GET', url: '/v1/health' })).statusCode).toBe(200);
    // Uma consulta por fonte: clima, ar, Metrô e banco (alagamento)
    await vi.waitFor(() => {
      expect(chamadas.sort()).toEqual(['air-quality-api.open-meteo.com', 'api.open-meteo.com', 'www.metro.sp.gov.br']);
      expect(consultasBanco).toBe(1);
    });
    await app2.close();
  });

  it('fontes fora do ar no boot só geram log; a API responde', async () => {
    const app3 = buildApp({ config: { segundoPlano: true }, deps: { http: httpSemRede, db: bancoFora } });
    await app3.ready();
    const res = await app3.inject({ method: 'GET', url: '/v1/weather?lat=-23.55&lon=-46.63' });
    expect(res.statusCode).toBe(200);
    await app3.close();
  });
});
