// T30 (RF15, RF16, RF19, RNF01–RNF03): falhas e integração PONTA A PONTA — buildApp + inject, com o runner,
// o cache, os breakers, os limitadores, o BriefingService e as rotas de verdade. Só a rede é falsa (fetch por
// host) e o banco fica fora. Onde o TC fala de uma fonte real, o adaptador real é usado com o fetch falso;
// as demais dimensões vêm dos "reais falsos" (simulados com o `source` verdadeiro), para isolar o caso.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { BriefingResponseSchema, ProvidersHealthResponseSchema, type TrajetoRequest } from '@kairos/contracts';
import { buildApp, type ConfigApp, type DependenciasApp } from '../src/app.js';
import { HttpStatusError } from '../src/infrastructure/errors.js';
import { createHttpClient, type FetchInit } from '../src/infrastructure/http-client.js';
import type { ProvedoresReais } from '../src/modules/briefing/briefing.service.js';
import { CENARIOS, CenarioAtivo, NOMES_CENARIO, TRAJETO_REFERENCIA, type NomeCenario } from '../src/modules/demo/index.js';
import { FakeClock, hangingFetch, jsonResponse } from './infrastructure/helpers.js';
import { AGORA_MS, TRAJETO, bancoFora, osrmFalso, reaisFalsos, tomtomFalsa } from './modules/briefing/helpers.js';
import { TOKEN_TESTE, fakeOlhoVivo } from './providers/transit/olhovivo-fake.js';

const ler = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const ARTESP_STATUS = ler('./providers/rail/fixtures/artesp-status-2026-10-13.json');
const METRO_HTML = ler('./providers/rail/fixtures/direto-metro-2026-10-10.html');
const FORECAST = ler('./providers/weather/fixtures/forecast-2026-10-12.json');
const TOMTOM_CARRO = ler('./providers/routing/fixtures/tomtom-rota-carro-2026-10-13.json');
/** current.time do fixture é 15:45 de 12/10 (SP); 1 min depois, o clima real sai fresh. */
const AGORA_FORECAST_MS = Date.parse('2026-10-12T15:46:00-03:00');

type Falsos = ReturnType<typeof reaisFalsos>['reais'];
type Rede = (url: URL, init?: FetchInit) => Response | Promise<Response> | undefined;

interface Opcoes {
  config?: ConfigApp;
  /** Escolhe, dos reais falsos, quais entram (omitir uma chave = adaptador real com o fetch falso). */
  reais?: (falsos: Falsos) => Partial<ProvedoresReais>;
  /** Resposta por URL; undefined = "sem rede". */
  rede?: Rede;
  deps?: Partial<DependenciasApp>;
  agoraMs?: number;
  cenarioReais?: NomeCenario;
}

const abertos: { close: () => Promise<unknown> }[] = [];
afterEach(async () => {
  await Promise.all(abertos.splice(0).map((a) => a.close()));
});

function montar(o: Opcoes = {}) {
  const clock = new FakeClock(o.agoraMs ?? AGORA_MS);
  const hosts: string[] = [];
  const logs: Record<string, unknown>[] = [];
  const http = createHttpClient({
    fetch: async (input, init) => {
      const url = new URL(String(input));
      hosts.push(url.host);
      const r = await o.rede?.(url, init);
      if (r) return r;
      throw new Error('sem rede no teste');
    },
  });
  const { reais: falsos } = reaisFalsos(clock, new CenarioAtivo(clock, o.cenarioReais ?? 'normal'));
  const app = buildApp({
    server: { logger: { level: 'info', stream: { write: (linha: string) => void logs.push(JSON.parse(linha)) } } },
    config: o.config,
    deps: {
      clock,
      http,
      db: bancoFora,
      osrm: osrmFalso(false),
      // Rotas TomTom falsas (carro = geometria + trânsito do briefing)
      tomtom: { carro: tomtomFalsa(), aPe: tomtomFalsa() },
      ...o.deps,
      reais: o.reais ? o.reais(falsos) : falsos,
    },
  });
  abertos.push(app);

  async function briefing(trajeto: TrajetoRequest = TRAJETO) {
    const res = await app.inject({ method: 'POST', url: '/v1/briefings', payload: { trajeto } });
    expect(res.statusCode, res.body).toBe(200); // RNF02: nunca 5xx
    return BriefingResponseSchema.parse(res.json());
  }
  async function saude(fonte: string) {
    const res = await app.inject({ method: 'GET', url: '/v1/health/providers' });
    return ProvidersHealthResponseSchema.parse(res.json()).providers.find((p) => p.name === fonte);
  }
  const chamadasA = (host: string) => hosts.filter((h) => h === host).length;
  const falhas = () => logs.filter((l) => l.msg === 'falha no provedor');
  return { app, clock, falsos, hosts, logs, briefing, saude, chamadasA, falhas };
}

const obs = (b: { observacoes: { dimension: string }[] }, d: string) => b.observacoes.find((o) => o.dimension === d) as
  | (Record<string, unknown> & { status: string; motivo?: string; value: unknown })
  | undefined;

/** Sem sua chave: devolve os reais falsos sem a dimensão `d` (o app monta o adaptador real). */
function semDimensao<K extends keyof Falsos>(d: K) {
  return (f: Falsos) => {
    const copia: Partial<Falsos> = { ...f };
    delete copia[d];
    return copia as Partial<ProvedoresReais>;
  };
}

/** Resposta da ARTESP com o `meta.timestamp` = agora no relógio falso (hora local de SP, como a fonte). */
function artespAgora(clock: FakeClock) {
  const local = new Date(clock.now() - 3 * 3_600_000).toISOString().slice(0, 23);
  return new Response(ARTESP_STATUS.replace('2026-10-13T15:04:40.914266', local), { status: 200 });
}

describe('TC12 — fonte fora (503) não derruba o briefing (RF15, RNF02)', () => {
  it('Olho Vivo real com /Previsao/Parada em 503 → 200; bus unavailable com motivo; confiança ≤ MÉDIA', async () => {
    const sptrans = fakeOlhoVivo();
    sptrans.responder('/Previsao/Parada', () => new Response('Service Unavailable', { status: 503 }));
    const t = montar({
      config: { sptransToken: TOKEN_TESTE },
      reais: semDimensao('bus'),
      rede: (url, init) => (url.host === 'api.olhovivo.sptrans.com.br' ? sptrans.fetch(url, init) : undefined),
    });

    const b = await t.briefing();

    expect(obs(b, 'bus')).toMatchObject({ source: 'sptrans-olhovivo', status: 'unavailable', value: null, motivo: 'A fonte respondeu com erro (HTTP 503)' });
    expect(['MEDIA', 'BAIXA']).toContain(b.confianca.nivel);
    expect(obs(b, 'weather')?.status).toBe('fresh');
    expect(t.falhas()).toEqual([expect.objectContaining({ provider: 'sptrans-olhovivo', erro: 'http-status', httpStatus: 503 })]);
  });
});

describe('TC13 — timeout de 3 s e prazo global de 4 s (RF15, RNF01), relógio REAL', () => {
  it('Open-Meteo real pendurada → timeout do provedor; resposta em ≤ 4 s com clima unavailable', async () => {
    const t = montar({
      reais: semDimensao('weather'),
      rede: (url, init) => (url.host === 'api.open-meteo.com' ? hangingFetch()(url, init) : undefined),
    });

    const inicio = performance.now();
    const b = await t.briefing();
    const ms = performance.now() - inicio;

    expect(ms).toBeGreaterThanOrEqual(2_900);
    expect(ms).toBeLessThanOrEqual(4_000);
    expect(obs(b, 'weather')).toMatchObject({ status: 'unavailable', motivo: 'A fonte não respondeu a tempo' });
    expect(obs(b, 'air')?.status).toBe('fresh');
    expect(t.falhas()).toEqual([expect.objectContaining({ provider: 'open-meteo', erro: 'timeout' })]);
  });

  it('fonte com timeout próprio de 10 s (pendurada) → o prazo global de 4 s corta só ela', async () => {
    // clima-lento: o clima responde em 10 s; com timeoutMs 10 s, só o prazo do briefing o interrompe
    const t = montar({
      cenarioReais: 'clima-lento',
      reais: (f) => ({ ...f, weather: { ...f.weather, timeoutMs: 10_000 } }),
    });

    const inicio = performance.now();
    const b = await t.briefing();
    const ms = performance.now() - inicio;

    expect(ms).toBeGreaterThanOrEqual(3_900);
    // 4 s do prazo + composição; a margem cobre a máquina carregada (não é a medida do TC31)
    expect(ms).toBeLessThan(4_500);
    expect(obs(b, 'weather')?.status).toBe('unavailable');
    for (const d of ['air', 'bus', 'rail', 'flood', 'traffic']) expect(obs(b, d)?.status, d).toBe('fresh');
  });
});

describe('TC14 — resposta fora do esquema (RF15, RNF10)', () => {
  it.each([
    ['JSON malformado', '{"latitude": -23.55, "hourly": {', 'invalid-json'],
    ['campo faltando', JSON.stringify({ latitude: -23.55, longitude: -46.63 }), 'schema'],
  ])('Open-Meteo real com %s → clima unavailable, 200, log com o erro e o trecho', async (_nome, corpo, erro) => {
    const t = montar({
      reais: semDimensao('weather'),
      rede: (url) => (url.host === 'api.open-meteo.com' ? new Response(corpo, { status: 200 }) : undefined),
    });

    const b = await t.briefing();

    expect(obs(b, 'weather')).toMatchObject({ status: 'unavailable', value: null });
    expect(t.falhas()).toEqual([expect.objectContaining({ provider: 'open-meteo', dimension: 'weather', erro, trecho: expect.any(String) })]);
  });
});

describe('TC15 — dado vencido vale como stale até 3×TTL (RF12, RF13, B.8)', () => {
  it('clima ok → fonte cai: stale com 20 min (TTL 15) e confiança MÉDIA; depois de 45 min, unavailable', async () => {
    let fora = false;
    const t = montar();
    const clima = t.falsos.weather;
    const original = clima.fetch;
    clima.fetch = (i, ctx) => (fora ? Promise.reject(new HttpStatusError(503, 'https://api.open-meteo.com/v1/forecast', '')) : original(i, ctx));

    expect(obs(await t.briefing(), 'weather')?.status).toBe('fresh');

    fora = true;
    t.clock.advance(20 * 60_000);
    const vencido = await t.briefing();
    expect(obs(vencido, 'weather')).toMatchObject({
      status: 'stale',
      motivo: 'A fonte respondeu com erro (HTTP 503); usando dado de 20 min atrás',
      value: expect.anything(),
    });
    expect(vencido.confianca.nivel).toBe('MEDIA');

    t.clock.advance(26 * 60_000); // 46 min > 3 × 15 min
    expect(obs(await t.briefing(), 'weather')).toMatchObject({ status: 'unavailable', value: null, motivo: 'A fonte respondeu com erro (HTTP 503)' });
  });
});

describe('TC16 — cache (RF16)', () => {
  it('2 briefings iguais em 10 s → nenhuma fonte chamada de novo; log miss e depois hit', async () => {
    const t = montar();

    await t.briefing();
    t.clock.advance(10_000);
    await t.briefing();

    for (const [d, p] of Object.entries(t.falsos)) expect(p.chamadas, d).toBe(1);
    const clima = t.logs.filter((l) => l.msg === 'provider' && l.provider === 'open-meteo').map((l) => l.cache);
    expect(clima).toEqual(['miss', 'hit']);
  });
});

describe('TC17 — limite da ARTESP (RF16, RNF03): 50 briefings em 1 h simulada', () => {
  const L8: TrajetoRequest = { ...TRAJETO, trilhos: ['L8'] };

  it('ARTESP respondendo: ≤ 10 chamadas (TTL 6 min) e a L8 sempre com dado', async () => {
    const t = montar({ config: { artespKey: 'chave-falsa' }, rede: (url) => (url.host === 'ccm.artesp.sp.gov.br' ? artespAgora(t.clock) : undefined) });

    for (let i = 0; i < 50; i++) {
      const b = await t.briefing(L8);
      expect(obs(b, 'rail')?.status, `briefing ${i}`).not.toBe('unavailable');
      t.clock.advance(72_000); // 50 × 72 s = 1 h
    }

    expect(t.chamadasA('ccm.artesp.sp.gov.br')).toBeGreaterThan(0);
    expect(t.chamadasA('ccm.artesp.sp.gov.br')).toBeLessThanOrEqual(10);
    expect((await t.saude('artesp'))?.requestCount).toBe(t.chamadasA('ccm.artesp.sp.gov.br'));
  });

  it('ARTESP fora (sem cache, todo briefing quer chamar): o limitador segura em 10/h; L4 cai para o Metrô', async () => {
    const t = montar({
      config: { artespKey: 'chave-falsa' },
      rede: (url) => (url.host === 'ccm.artesp.sp.gov.br' ? new Response('erro', { status: 503 }) : undefined),
    });

    for (let i = 0; i < 50; i++) {
      const b = await t.briefing({ ...TRAJETO, trilhos: ['L4'] });
      expect(obs(b, 'rail')).toMatchObject({ source: 'metro-sp', status: 'fresh' });
      t.clock.advance(72_000);
    }

    expect(t.chamadasA('ccm.artesp.sp.gov.br')).toBeLessThanOrEqual(10);
  });
});

describe('TC18 — circuit breaker (RF15, C.5: 3 falhas, 60 s aberto)', () => {
  it('Open-Meteo real em 503: 5 briefings → 3 chamadas; health indisponível; após 60 s a fonte volta e o breaker fecha', async () => {
    let fora = true;
    const t = montar({
      agoraMs: AGORA_FORECAST_MS,
      reais: semDimensao('weather'),
      rede: (url) => {
        if (url.host !== 'api.open-meteo.com') return undefined;
        return fora ? new Response('erro', { status: 503 }) : new Response(FORECAST, { status: 200 });
      },
    });

    for (let i = 0; i < 5; i++) {
      expect(obs(await t.briefing(), 'weather')?.status).toBe('unavailable');
      t.clock.advance(1_000);
    }
    expect(t.chamadasA('api.open-meteo.com')).toBe(3);
    expect(await t.saude('open-meteo')).toMatchObject({ status: 'indisponivel', requestCount: 3, successCount: 0 });

    fora = false;
    t.clock.advance(60_000);
    expect(obs(await t.briefing(), 'weather')?.status).toBe('fresh');
    expect(t.chamadasA('api.open-meteo.com')).toBe(4);
    expect(await t.saude('open-meteo')).toMatchObject({ status: 'ok', successCount: 1 });
  });
});

describe('Cota da TomTom (RF24, C.5: ≤ 600/24 h)', () => {
  it('600 rotas de carro numa janela → a 601ª nem chama a TomTom e sai pelo OSRM; o briefing também cai para o OSRM', async () => {
    const t = montar({
      config: { tomtomKey: 'chave-tomtom-falsa' },
      deps: { tomtom: undefined },
      rede: (url) => (url.host === 'api.tomtom.com' ? new Response(TOMTOM_CARRO, { status: 200 }) : undefined),
    });
    const rota = (i: number) => t.app.inject({ method: 'GET', url: `/v1/rota?de=-23.5615,-46.6560&para=${(-23.5 - i / 1000).toFixed(4)},-46.6331` });

    for (let i = 0; i < 600; i++) {
      t.clock.advance(250); // QPS: 1 chamada a cada 250 ms, sem dormir de verdade
      expect((await rota(i)).json().fonte).toBe('tomtom');
    }
    t.clock.advance(250);
    const excedente = await rota(600);
    expect(excedente.statusCode).toBe(200);
    expect(excedente.json().fonte).toBe('osrm');
    expect(t.chamadasA('api.tomtom.com')).toBe(600);

    const b = await t.briefing();
    expect(b.geometria.fonte).toBe('osrm');
    expect(obs(b, 'traffic')).toMatchObject({ status: 'unavailable', motivo: 'Limite de consultas à fonte atingido' });
    expect(t.chamadasA('api.tomtom.com')).toBe(600);
  });
});

describe('Fallbacks por fonte alternativa', () => {
  it('ARTESP real em 503 → L4 e L5 pela página real do Metrô; L8 some e a falha vira motivo', async () => {
    const t = montar({
      config: { artespKey: 'chave-falsa' },
      reais: semDimensao('rail'),
      rede: (url) => {
        if (url.host === 'ccm.artesp.sp.gov.br') return new Response('erro', { status: 503 });
        if (url.host === 'www.metro.sp.gov.br') return new Response(METRO_HTML, { status: 200 });
        return undefined;
      },
    });

    const b = await t.briefing({ ...TRAJETO, trilhos: ['L4', 'L5', 'L8'] });

    const rail = obs(b, 'rail') as { source: string; status: string; motivo: string; value: { linhas: { linha: string; fonte: string }[] } };
    expect(rail).toMatchObject({ source: 'metro-sp', status: 'fresh', motivo: expect.stringMatching(/^ARTESP: .*503/) });
    expect(rail.value.linhas.map((l) => [l.linha, l.fonte])).toEqual([
      ['L4', 'metro-sp'],
      ['L5', 'metro-sp'],
    ]);
    expect(b.atribuicoes).not.toContain('ARTESP (CC BY-NC 4.0)');
    expect(t.chamadasA('www.metro.sp.gov.br')).toBe(1);
  });

  const OSRM_OK = { code: 'Ok', routes: [{ distance: 3100, duration: 620, geometry: { type: 'LineString', coordinates: [[-46.656, -23.5615], [-46.645, -23.556], [-46.6331, -23.5504]] } }] };

  it.each([
    ['OSRM responde', 'osrm', true],
    ['OSRM também fora', 'linha-reta', false],
  ])('TomTom real em 503, %s → geometria %s; alagamento calculado sobre ela; trânsito unavailable', async (_n, fonte, osrmOk) => {
    const t = montar({
      config: { tomtomKey: 'chave-tomtom-falsa' },
      deps: { tomtom: undefined, osrm: undefined },
      rede: (url) => {
        if (url.host === 'api.tomtom.com') return new Response('erro', { status: 503 });
        if (url.host === 'router.project-osrm.org') return osrmOk ? jsonResponse(OSRM_OK) : new Response('erro', { status: 503 });
        return undefined;
      },
    });

    const b = await t.briefing();

    expect(b.geometria.fonte).toBe(fonte);
    expect(obs(b, 'flood')?.status).toBe('fresh');
    expect(obs(b, 'traffic')).toMatchObject({ status: 'unavailable', motivo: 'TomTom fora do ar (HTTP 503)' });
    expect(b.atribuicoes).not.toContain('© TomTom');
    if (fonte === 'linha-reta') {
      // A linha reta é só para o raio de alagamento: /v1/rota nunca a devolve (503)
      const rota = await t.app.inject({ method: 'GET', url: '/v1/rota?de=-23.5615,-46.6560&para=-23.5504,-46.6331' });
      expect(rota.statusCode).toBe(503);
    }
  });
});

describe('Modo demonstração ponta a ponta (RF19, TC24): cada cenário do catálogo por HTTP', () => {
  const TOKEN = 'token-de-teste-com-mais-de-32-caracteres-0123';
  const simulados = NOMES_CENARIO.filter((n) => CENARIOS[n].esperado !== null);

  it.each(simulados)('%s → veredito, confiança, regras e estados esperados', async (nome) => {
    const t = montar({ config: { demoMode: true, demoToken: TOKEN } });
    const ativar = await t.app.inject({ method: 'POST', url: '/v1/demo/scenario', headers: { 'x-demo-token': TOKEN }, payload: { cenario: nome } });
    expect(ativar.statusCode).toBe(200);

    const b = await t.briefing({ ...TRAJETO, ...TRAJETO_REFERENCIA });

    const esperado = CENARIOS[nome].esperado!;
    expect(b.veredito).toBe(esperado.veredito);
    expect(b.confianca.nivel).toBe(esperado.confianca);
    expect(b.motivos.map((m) => m.regra)).toEqual(esperado.regras);
    for (const o of b.observacoes) {
      expect(o.status, o.dimension).toBe(esperado.estados[o.dimension] ?? 'fresh');
      expect(o.source.startsWith('simulado:'), o.dimension).toBe(true);
    }
    // Nenhum provedor real foi chamado
    for (const [d, p] of Object.entries(t.falsos)) expect(p.chamadas, d).toBe(0);
  });
});
