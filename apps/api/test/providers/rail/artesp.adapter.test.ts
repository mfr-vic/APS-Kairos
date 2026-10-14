import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ObservationSchema } from '@kairos/contracts';
import { LruCache } from '../../../src/infrastructure/cache/lru-cache.js';
import { createHttpClient, type FetchFn, type FetchInit } from '../../../src/infrastructure/http-client.js';
import { ProviderRunner } from '../../../src/infrastructure/provider-runner.js';
import {
  ARTESP_SOURCE,
  ARTESP_STATUS_URL,
  artespParaIso,
  createArtespAdapter,
  situacaoArtesp,
} from '../../../src/providers/rail/artesp.adapter.js';
import { FakeClock, memoryLogger } from '../../infrastructure/helpers.js';

// Resposta REAL do GET /status/ (spike T05, 13/10/2026 15:04:40 SP); nenhum teste chama a rede
const STATUS_REAL = readFileSync(fileURLToPath(new URL('./fixtures/artesp-status-2026-10-13.json', import.meta.url)), 'utf8');
/** meta.timestamp da fixture (15:04:40.914266 SP) em UTC. */
const RESPONDIDO_EM = Date.parse('2026-10-13T18:04:40.914Z');
const CHAVE = 'chave-de-teste-nao-real';

/** A fixture com meta.timestamp = `ms` (hora local de SP), como a fonte responde a cada chamada. */
function statusEm(ms: number): Response {
  const local = new Date(ms - 3 * 3_600_000).toISOString().slice(0, 23);
  return new Response(STATUS_REAL.replace('2026-10-13T15:04:40.914266', local), { status: 200 });
}

function setup(resposta: (agora: number) => Response = () => new Response(STATUS_REAL, { status: 200 })) {
  const chamadas: { url: string; init?: FetchInit }[] = [];
  const fetch: FetchFn = async (url, init) => {
    chamadas.push({ url: String(url), init });
    return resposta(clock.now());
  };
  const clock = new FakeClock(RESPONDIDO_EM + 1_000);
  const provider = createArtespAdapter({ chave: CHAVE, http: createHttpClient({ fetch }), clock });
  const runner = new ProviderRunner({ cache: new LruCache({ clock }), clock, rateLimiters: { [ARTESP_SOURCE]: provider.limiter } });
  const logger = memoryLogger();
  const observar = () => runner.observe(provider, ['L4'], { logger });
  return { chamadas, clock, provider, runner, logger, observar };
}

describe('artespParaIso / situacaoArtesp', () => {
  it('hora local de SP sem fuso (com ou sem microssegundos) → ISO -03:00', () => {
    expect(artespParaIso('2026-10-13T15:04:40.914266')).toBe('2026-10-13T15:04:40.914-03:00');
    expect(artespParaIso('2026-10-13T04:42:14')).toBe('2026-10-13T04:42:14-03:00');
    expect(artespParaIso('2026-10-13T11:06:51.5')).toBe('2026-10-13T11:06:51.5-03:00');
    expect(artespParaIso('2026-10-13T18:04:40Z')).toBe('2026-10-13T18:04:40Z');
    expect(artespParaIso('13/10/2026 15:04')).toBeNull();
  });

  it('RN06: normal pelo texto ou por operacao_normal; encerrada/paralisada sempre PARALISADA; resto ALTERADA', () => {
    expect(situacaoArtesp('Operação Normal', true)).toBe('NORMAL');
    expect(situacaoArtesp('Operação Normal', false)).toBe('NORMAL');
    expect(situacaoArtesp('Circulação normal', true)).toBe('NORMAL');
    expect(situacaoArtesp('Operação Encerrada', false)).toBe('PARALISADA');
    expect(situacaoArtesp('Operação Paralisada', true)).toBe('PARALISADA');
    expect(situacaoArtesp('Maiores Intervalos', false)).toBe('ALTERADA');
    expect(situacaoArtesp('Velocidade reduzida', false)).toBe('ALTERADA');
  });
});

describe('createArtespAdapter (T19, RF09)', () => {
  it('chama /status/ com Api-Key e User-Agent; mapeia as 6 linhas da fixture real', async () => {
    const { chamadas, provider } = setup();
    const r = await provider.fetch(['L8'], { signal: new AbortController().signal });

    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]!.url).toBe(ARTESP_STATUS_URL);
    const headers = chamadas[0]!.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Api-Key ${CHAVE}`);
    expect(headers['User-Agent']).toMatch(/^Kairos-APS\//);
    expect(provider.ttlSeconds).toBe(360);
    expect(provider.timeoutMs).toBe(3000);
    expect(provider.refreshAhead).toBeFalsy(); // fora da renovação antecipada (12,5 chamadas/h > teto)
    expect(provider.cacheKey(['L4'])).toBe(provider.cacheKey(['L8', 'L9']));

    // fim do retrato (meta.timestamp + 5 min) limitado a agora (1 s depois); nunca atualizado_em
    expect(r.observedAt).toBe('2026-10-13T15:04:41.914-03:00');
    expect(r.value.linhas).toEqual([
      { linha: 'L4', statusTexto: 'Operação Normal', situacao: 'NORMAL', detalhe: null, fonte: 'artesp' },
      { linha: 'L5', statusTexto: 'Operação Normal', situacao: 'NORMAL', detalhe: null, fonte: 'artesp' },
      // "Operação Encerrada" + classificacao "ignorar" → PARALISADA (linha fechada não pode ser usada)
      { linha: 'L6', statusTexto: 'Operação Encerrada', situacao: 'PARALISADA', detalhe: null, fonte: 'artesp' },
      {
        linha: 'L7',
        statusTexto: 'Operação Normal',
        situacao: 'NORMAL',
        detalhe: 'Linha opera normalmente em toda sua extensão.',
        fonte: 'artesp',
      },
      {
        linha: 'L8',
        statusTexto: 'Maiores Intervalos',
        situacao: 'ALTERADA',
        detalhe:
          'Devido à atividade de manutenção programada, os trens da Linha 8-Diamante circulam com maiores intervalos entre as estações Barueri e Itapevi.',
        fonte: 'artesp',
      },
      { linha: 'L9', statusTexto: 'Operação Normal', situacao: 'NORMAL', detalhe: null, fonte: 'artesp' },
    ]);
  });

  it('regressão: linha normal com atualizado_em de 11 h atrás sai fresh (idade por meta.timestamp)', async () => {
    const { observar } = setup();
    const obs = await observar();
    expect(ObservationSchema.safeParse(obs).success).toBe(true);
    expect(obs).toMatchObject({ source: 'artesp', status: 'fresh', ttlSeconds: 360, observedAt: '2026-10-13T15:04:41.914-03:00' });
  });

  it('regressão (13/10): retrato com 193 s de atraso continua fresh até o fim do cache de 6 min', async () => {
    // Medido ao vivo: meta.timestamp 15:28:35 numa resposta das 15:31:48. Pela regra antiga (idade a partir do
    // meta.timestamp) a idade no fim do cache seria 193 + 359 = 552 s > 360 → stale.
    const { observar, clock } = setup();
    clock.advance(193_000 - 1_000);
    const primeira = await observar();
    expect(primeira.observedAt).toBe('2026-10-13T15:07:53.914-03:00'); // agora (antes do fim do retrato)
    clock.advance(359_000);
    const doCache = await observar();
    expect(doCache.status).toBe('fresh');
  });

  it('retrato realmente velho (meta.timestamp 20 min atrás) vale só até o fim dele: +5 min', async () => {
    const { provider, clock } = setup();
    clock.advance(20 * 60_000);
    const r = await provider.fetch(['L4'], { signal: new AbortController().signal });
    expect(r.observedAt).toBe('2026-10-13T15:09:40.914-03:00');
  });

  it('linha 4–9 ausente da resposta → unavailable (não vira "tudo normal")', async () => {
    const semL9 = STATUS_REAL.replace('"codigo": "9"', '"codigo": "99"');
    const { observar, logger } = setup(() => new Response(semL9, { status: 200 }));
    const obs = await observar();
    expect(obs).toMatchObject({ status: 'unavailable', motivo: 'A fonte respondeu em formato inesperado' });
    expect(String(logger.lines.find((l) => l.level === 'warn')?.obj.mensagem)).toMatch(/linhas ausentes na resposta: L9/);
  });

  it('JSON inválido e JSON fora do esquema → unavailable com log', async () => {
    const malformado = setup(() => new Response('{"meta": ', { status: 200 }));
    expect(await malformado.observar()).toMatchObject({ status: 'unavailable', motivo: 'A fonte respondeu em formato inesperado' });
    expect(malformado.logger.lines.some((l) => l.obj.erro === 'invalid-json')).toBe(true);

    const semMeta = setup(() => new Response(JSON.stringify({ empresas: [] }), { status: 200 }));
    expect((await semMeta.observar()).status).toBe('unavailable');
    expect(semMeta.logger.lines.some((l) => l.obj.erro === 'schema')).toBe(true);
  });

  it('401 e 403 → motivo humano, e a chave nunca aparece nos logs', async () => {
    const r401 = setup(() => new Response('{"detail":"Chave inválida"}', { status: 401 }));
    expect(await r401.observar()).toMatchObject({ status: 'unavailable', motivo: 'ARTESP recusou a chave (HTTP 401)' });
    const r403 = setup(() => new Response('{"detail":"forbidden"}', { status: 403 }));
    expect(await r403.observar()).toMatchObject({
      status: 'unavailable',
      motivo: 'ARTESP: IP não autorizado ou termos de uso pendentes (HTTP 403)',
    });
    for (const { logger } of [r401, r403]) expect(JSON.stringify(logger.lines)).not.toContain(CHAVE);
  });

  it('429 → serve o cache vencido como stale e não chama de novo antes do Retry-After', async () => {
    let status = 200;
    const ctx = setup((agora) =>
      status === 200 ? statusEm(agora) : new Response('{}', { status, headers: { 'Retry-After': '900' } }),
    );
    await ctx.observar(); // 1ª: 200, cache
    status = 429;
    ctx.clock.advance(7 * 60_000); // TTL vencido
    const stale = await ctx.observar(); // 2ª: 429
    expect(stale.status).toBe('stale');
    expect(stale.motivo).toMatch(/Limite de consultas/);
    expect(ctx.chamadas).toHaveLength(2);

    ctx.clock.advance(5 * 60_000); // 12 min desde a 1ª; ainda dentro dos 900 s do Retry-After
    expect((await ctx.observar()).status).toBe('stale');
    expect(ctx.chamadas).toHaveLength(2); // não chamou

    status = 200;
    ctx.clock.advance(11 * 60_000); // Retry-After vencido
    expect((await ctx.observar()).status).toBe('fresh');
    expect(ctx.chamadas).toHaveLength(3);
  });

  it('TC17: 50 briefings em 1 h simulada → ARTESP chamada ≤ 10 vezes', async () => {
    const { chamadas, clock, observar } = setup(statusEm);
    for (let i = 0; i < 50; i++) {
      expect((await observar()).status).toBe('fresh');
      clock.advance(72_000); // 50 × 72 s = 1 h
    }
    expect(chamadas.length).toBeGreaterThan(0);
    expect(chamadas.length).toBeLessThanOrEqual(10);
  });
});
