// Tiles de fluxo da TomTom (RF22): tile real de 13/10/2026 (z14, centro de SP), cache de 2 min, cota e erros
// sem chave. Sem rede.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RateLimitedError, SchemaValidationError } from '../../../src/infrastructure/errors.js';
import { createHttpClient, type FetchFn } from '../../../src/infrastructure/http-client.js';
import { TOMTOM_TILE_TTL_S, TomTomFlowTiles } from '../../../src/providers/traffic/tomtom-flow-tiles.adapter.js';
import { FakeClock } from '../../infrastructure/helpers.js';

const PNG = readFileSync(new URL('../routing/fixtures/tomtom-tile-14-6069-9295.png', import.meta.url));
const CHAVE = 'chave-tile-teste';
const TILE = { z: 14, x: 6069, y: 9295 };

function montar(fetch: FetchFn) {
  const clock = new FakeClock();
  const urls: string[] = [];
  const tiles = new TomTomFlowTiles({
    chave: CHAVE,
    clock,
    http: createHttpClient({
      fetch: (u, i) => {
        urls.push(String(u));
        return fetch(u, i);
      },
    }),
  });
  return { tiles, clock, urls };
}

const ok: FetchFn = async () => new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } });

describe('TomTomFlowTiles', () => {
  it('busca o PNG no endpoint v4 relative0 e devolve os bytes intactos', async () => {
    const { tiles, urls } = montar(ok);
    const { png, cache } = await tiles.obter(TILE);
    expect(cache).toBe('miss');
    expect(png.equals(PNG)).toBe(true);
    const url = new URL(urls[0]!);
    expect(url.pathname).toBe('/traffic/map/4/tile/flow/relative0/14/6069/9295.png');
    expect(url.searchParams.get('key')).toBe(CHAVE);
  });

  it('cache de 2 min por tile', async () => {
    const { tiles, urls, clock } = montar(ok);
    await tiles.obter(TILE);
    expect((await tiles.obter(TILE)).cache).toBe('hit');
    clock.advance(TOMTOM_TILE_TTL_S * 1000 + 1);
    expect((await tiles.obter(TILE)).cache).toBe('miss');
    expect(urls).toHaveLength(2);
  });

  it('corpo que não é PNG → erro de schema (não vai para o app como imagem)', async () => {
    const { tiles } = montar(async () => new Response('<html>erro</html>', { status: 200 }));
    await expect(tiles.obter(TILE)).rejects.toBeInstanceOf(SchemaValidationError);
  });

  it('403 → motivo de chave, sem URL/chave no erro; 429 bloqueia a cota', async () => {
    const { tiles } = montar(async () => new Response(`Developer Inactive ${CHAVE}`, { status: 403 }));
    const erro = await tiles.obter(TILE).catch((e) => e);
    expect(erro.extra.motivo).toBe('TomTom recusou a chave (HTTP 403)');
    expect(JSON.stringify({ ...erro, m: erro.message })).not.toContain(CHAVE);

    const limitado = montar(async () => new Response('', { status: 429, headers: { 'retry-after': '30' } }));
    await expect(limitado.tiles.obter(TILE)).rejects.toBeInstanceOf(RateLimitedError);
    await expect(limitado.tiles.obter({ ...TILE, x: 6070 })).rejects.toBeInstanceOf(RateLimitedError);
    expect(limitado.urls).toHaveLength(1);
  });
});
