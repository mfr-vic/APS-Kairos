// GET /v1/mapa/transito/{z}/{x}/{y}.png (RF22): proxy de tiles com a chave só no servidor. Sem rede.
import { readFileSync } from 'node:fs';
import fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { ProblemDetailsSchema } from '@kairos/contracts';
import { createHttpClient } from '../../../src/infrastructure/http-client.js';
import { limitesDoTile, tocaSaoPaulo, transitoRoutes } from '../../../src/modules/mapa/transito.routes.js';
import { TomTomFlowTiles } from '../../../src/providers/traffic/tomtom-flow-tiles.adapter.js';
import { FakeClock } from '../../infrastructure/helpers.js';

const PNG = readFileSync(new URL('../../providers/routing/fixtures/tomtom-tile-14-6069-9295.png', import.meta.url));
const CHAVE = 'chave-mapa-teste';

function montar(status = 200) {
  let chamadas = 0;
  const tiles = new TomTomFlowTiles({
    chave: CHAVE,
    clock: new FakeClock(),
    http: createHttpClient({
      fetch: async () => {
        chamadas++;
        return new Response(status === 200 ? PNG : `erro ${CHAVE}`, { status });
      },
    }),
  });
  const app = fastify();
  app.register(transitoRoutes, { tiles });
  return { app, chamadas: () => chamadas };
}

describe('GET /v1/mapa/transito/{z}/{x}/{y}.png', () => {
  it('200 image/png com os bytes do tile, cache-control de 2 min, sem a chave', async () => {
    const { app } = montar();
    const res = await app.inject({ method: 'GET', url: '/v1/mapa/transito/14/6069/9295.png' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toBe('public, max-age=120');
    expect(res.rawPayload.equals(PNG)).toBe(true);
    expect(JSON.stringify(res.headers)).not.toContain(CHAVE);
    expect(res.rawPayload.includes(CHAVE)).toBe(false);
  });

  it.each([
    ['zoom abaixo de 10', '/v1/mapa/transito/9/189/290.png'],
    ['zoom acima de 18', '/v1/mapa/transito/19/194229/297450.png'],
    ['fora de São Paulo (Rio de Janeiro)', '/v1/mapa/transito/14/6227/9263.png'],
    ['x fora de [0, 2^z)', '/v1/mapa/transito/10/1024/0.png'],
    ['não numérico', '/v1/mapa/transito/abc/1/2.png'],
  ])('400 sem chamar a TomTom: %s', async (_n, url) => {
    const { app, chamadas } = montar();
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(400);
    expect(ProblemDetailsSchema.parse(res.json()).code).toBe('VALIDATION_ERROR');
    expect(chamadas()).toBe(0);
  });

  it('TomTom recusa → 503 problem+json com motivo, sem a chave', async () => {
    const { app } = montar(403);
    const res = await app.inject({ method: 'GET', url: '/v1/mapa/transito/14/6069/9295.png' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: 'PROVIDER_UNAVAILABLE', detail: 'TomTom recusou a chave (HTTP 403)' });
    expect(res.body).not.toContain(CHAVE);
  });

  it('sem TOMTOM_KEY → 503', async () => {
    const app = fastify();
    app.register(transitoRoutes, { tiles: null });
    const res = await app.inject({ method: 'GET', url: '/v1/mapa/transito/14/6069/9295.png' });
    expect(res.statusCode).toBe(503);
    expect(res.json().detail).toMatch(/TOMTOM_KEY/);
  });

  it('limites do tile e bbox de SP', () => {
    const b = limitesDoTile({ z: 14, x: 6069, y: 9295 });
    expect(b.lonMin).toBeLessThan(-46.6333);
    expect(b.lonMax).toBeGreaterThan(-46.6333);
    expect(b.latMin).toBeLessThan(-23.5505);
    expect(b.latMax).toBeGreaterThan(-23.5505);
    expect(tocaSaoPaulo({ z: 14, x: 6069, y: 9295 })).toBe(true);
    expect(tocaSaoPaulo({ z: 14, x: 6227, y: 9263 })).toBe(false);
  });
});
