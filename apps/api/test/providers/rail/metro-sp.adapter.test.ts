import { describe, expect, it } from 'vitest';
import { ObservationSchema } from '@kairos/contracts';
import { LruCache } from '../../../src/infrastructure/cache/lru-cache.js';
import { createHttpClient, type FetchFn, type FetchInit } from '../../../src/infrastructure/http-client.js';
import { ProviderRunner } from '../../../src/infrastructure/provider-runner.js';
import {
  METRO_SP_URL,
  createMetroSpAdapter,
  filtrarLinhas,
  observarLinhasMetroSp,
  separarCobertura,
} from '../../../src/providers/rail/metro-sp.adapter.js';
import { FakeClock, memoryLogger } from '../../infrastructure/helpers.js';
import { COLETADO_EM, HTML_REAL, comSituacao } from './helpers.js';

// Nenhum teste chama a rede: o fetch é falso e devolve o HTML real salvo (10/10/2026 21:02 SP)
function setup(html: string = HTML_REAL, status = 200) {
  const chamadas: { url: string; init?: FetchInit }[] = [];
  const fetch: FetchFn = async (url, init) => {
    chamadas.push({ url: String(url), init });
    return new Response(html, { status, headers: { 'content-type': 'text/html; charset=UTF-8' } });
  };
  const clock = new FakeClock(COLETADO_EM);
  const runner = new ProviderRunner({ cache: new LruCache({ clock }), clock });
  const provider = createMetroSpAdapter({ http: createHttpClient({ fetch }) });
  return { chamadas, clock, runner, provider, logger: memoryLogger() };
}

describe('separarCobertura / filtrarLinhas', () => {
  it('a página cobre 1, 2, 3, 4, 5 e 15; o resto fica sem fonte', () => {
    expect(separarCobertura(['L1', 'L8', 'L15', 'L1', 'L11', 'L4'])).toEqual({
      cobertas: ['L1', 'L15', 'L4'],
      semFonte: ['L8', 'L11'],
    });
  });

  it('filtrarLinhas mantém só as vinculadas', () => {
    const value = {
      linhas: [
        { linha: 'L1' as const, statusTexto: 'Operação Normal', situacao: 'NORMAL' as const, detalhe: null, fonte: 'metro-sp' },
        { linha: 'L2' as const, statusTexto: 'Operação Normal', situacao: 'NORMAL' as const, detalhe: null, fonte: 'metro-sp' },
      ],
    };
    expect(filtrarLinhas(value, ['L2', 'L9'])).toEqual({ linhas: [value.linhas[1]] });
  });
});

describe('createMetroSpAdapter (T34, RF21)', () => {
  it('busca a página com o User-Agent do projeto e devolve as 6 linhas; observedAt fica com o runner', async () => {
    const { chamadas, provider } = setup();
    const r = await provider.fetch([], { signal: new AbortController().signal });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]!.url).toBe(METRO_SP_URL);
    const headers = chamadas[0]!.init?.headers as Record<string, string>;
    expect(headers['User-Agent']).toMatch(/^Kairos-APS\//);
    expect(r.value.linhas.map((l) => l.linha)).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'L15']);
    // Sem observedAt: vale a hora da leitura (o "atualizado em" da página é a última mudança, não a confirmação)
    expect(r.observedAt).toBeUndefined();
    expect(r.value.linhas.every((l) => l.fonte === 'metro-sp' && l.detalhe === null)).toBe(true);
    expect(provider.ttlSeconds).toBe(300);
    expect(provider.timeoutMs).toBe(3000);
    expect(provider.cacheKey(['L1'])).toBe(provider.cacheKey(['L4', 'L15']));
  });

  it('observarLinhasMetroSp: fresh, source metro-sp, só as vinculadas cobertas, envelope válido', async () => {
    const { runner, provider, logger } = setup();
    const obs = await observarLinhasMetroSp(runner, provider, ['L1', 'L8', 'L15'], { logger });
    expect(ObservationSchema.safeParse(obs).success).toBe(true);
    expect(obs).toMatchObject({ dimension: 'rail', source: 'metro-sp', status: 'fresh', ttlSeconds: 300 });
    expect(obs.observedAt).toBe(new Date(COLETADO_EM).toISOString());
    expect(obs.value).toEqual({
      linhas: [
        { linha: 'L1', statusTexto: 'Operação Normal', situacao: 'NORMAL', detalhe: null, fonte: 'metro-sp' },
        { linha: 'L15', statusTexto: 'Operação Normal', situacao: 'NORMAL', detalhe: null, fonte: 'metro-sp' },
      ],
    });
  });

  it('uma página serve todos os trajetos: 2 trajetos diferentes → 1 chamada (cache)', async () => {
    const { chamadas, runner, provider, logger } = setup();
    const a = await observarLinhasMetroSp(runner, provider, ['L1'], { logger });
    const b = await observarLinhasMetroSp(runner, provider, ['L4', 'L5'], { logger });
    expect(chamadas).toHaveLength(1);
    expect(a.value?.linhas.map((l) => l.linha)).toEqual(['L1']);
    expect(b.value?.linhas.map((l) => l.linha)).toEqual(['L4', 'L5']);
  });

  it('situação alterada (fixture sintética) chega normalizada ao envelope', async () => {
    const { runner, provider, logger } = setup(comSituacao(HTML_REAL, '3', 'Operação Paralisada'));
    const obs = await observarLinhasMetroSp(runner, provider, ['L3'], { logger });
    expect(obs.value?.linhas).toEqual([
      { linha: 'L3', statusTexto: 'Operação Paralisada', situacao: 'PARALISADA', detalhe: expect.any(String), fonte: 'metro-sp' },
    ]);
  });

  it('HTML alterado → unavailable com motivo, sem lançar', async () => {
    const { runner, provider, logger } = setup('<html><body><p>Em manutenção</p></body></html>');
    const obs = await observarLinhasMetroSp(runner, provider, ['L1'], { logger });
    expect(ObservationSchema.safeParse(obs).success).toBe(true);
    expect(obs.status).toBe('unavailable');
    expect(obs.value).toBeNull();
    expect(obs.motivo).toBe('A fonte respondeu em formato inesperado');
    expect(logger.lines.some((l) => l.level === 'warn' && l.obj.erro === 'schema')).toBe(true);
  });

  it('linha coberta ausente da página → unavailable (não vira "tudo normal")', async () => {
    const semL15 = HTML_REAL.replace(/(class="linha-numero"[^>]*>)15</, '$117<');
    const { runner, provider, logger } = setup(semL15);
    const obs = await observarLinhasMetroSp(runner, provider, ['L1'], { logger });
    expect(obs.status).toBe('unavailable');
    const aviso = logger.lines.find((l) => l.level === 'warn');
    expect(String(aviso?.obj.mensagem)).toMatch(/linhas ausentes na página: L15/);
  });

  it('HTTP 500 → unavailable', async () => {
    const { runner, provider, logger } = setup('erro', 500);
    const obs = await observarLinhasMetroSp(runner, provider, ['L2'], { logger });
    expect(obs).toMatchObject({ status: 'unavailable', motivo: 'A fonte respondeu com erro (HTTP 500)' });
  });

  it('regressão T19: "atualizado em" antigo (última mudança) não deixa a leitura stale', async () => {
    // A fixture diz "atualizado em 21:01"; lida 3 h depois, a página continua confirmando o status agora
    const { clock, runner, provider, logger } = setup();
    clock.advance(3 * 60 * 60_000);
    const obs = await observarLinhasMetroSp(runner, provider, ['L1'], { logger });
    expect(obs.status).toBe('fresh');
    expect(obs.observedAt).toBe(new Date(clock.now()).toISOString());
  });

  it('idade contada a partir da leitura: página fora depois de 10 min → stale com o cache (B.8)', async () => {
    let falhar = false;
    const fetch: FetchFn = async () => (falhar ? new Response('erro', { status: 500 }) : new Response(HTML_REAL, { status: 200 }));
    const clock = new FakeClock(COLETADO_EM);
    const runner = new ProviderRunner({ cache: new LruCache({ clock }), clock });
    const provider = createMetroSpAdapter({ http: createHttpClient({ fetch }) });
    const logger = memoryLogger();
    await observarLinhasMetroSp(runner, provider, ['L1'], { logger });
    falhar = true;
    clock.advance(10 * 60_000);
    expect((await observarLinhasMetroSp(runner, provider, ['L1'], { logger })).status).toBe('stale');
  });
});
