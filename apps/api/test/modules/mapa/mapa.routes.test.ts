// GET /v1/mapa/camadas: as duas camadas pelo runner único; uma fonte fora não derruba a outra.
import { readFileSync } from 'node:fs';
import fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { MapaCamadasResponseSchema } from '@kairos/contracts';
import { LruCache } from '../../../src/infrastructure/cache/lru-cache.js';
import { createHttpClient, type FetchFn } from '../../../src/infrastructure/http-client.js';
import { ProviderRunner } from '../../../src/infrastructure/provider-runner.js';
import type { Queryable } from '../../../src/modules/flood-risk/index.js';
import { GradeClimaAdapter } from '../../../src/modules/mapa/grade-clima.adapter.js';
import { mapaRoutes } from '../../../src/modules/mapa/mapa.routes.js';
import { PontosAlagamentoAdapter } from '../../../src/modules/mapa/pontos-alagamento.adapter.js';
import { FakeClock, jsonResponse } from '../../infrastructure/helpers.js';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/grade-2026-10-13.json', import.meta.url), 'utf8')) as unknown;
const LINHA = { source_id: 'geosampa:alagamento:19', occurred_on: '2026-01-04', address: 'PA - PARELHEIROS', lat: -23.819657, lon: -46.702602 };

function montarApp({ clima = () => jsonResponse(FIXTURE), bancoFora = false } = {}) {
  const chamadas = { clima: 0, banco: 0 };
  const fetch: FetchFn = async () => {
    chamadas.clima++;
    return clima();
  };
  const db = {
    query: async () => {
      chamadas.banco++;
      if (bancoFora) throw new Error('ECONNREFUSED');
      return { rows: [LINHA] };
    },
  } as unknown as Queryable;
  const clock = new FakeClock(Date.parse('2026-10-13T22:20:00Z'));
  const runner = new ProviderRunner({ cache: new LruCache({ clock }), clock });
  const app = fastify();
  app.register(mapaRoutes, {
    runner,
    alagamento: new PontosAlagamentoAdapter(db),
    clima: new GradeClimaAdapter(createHttpClient({ fetch }), clock),
  });
  return { app, chamadas };
}

describe('GET /v1/mapa/camadas', () => {
  it('200 válido no contrato, com limiares da B.8, pontos de alagamento e grade de clima', async () => {
    const { app } = montarApp();
    const res = await app.inject({ method: 'GET', url: '/v1/mapa/camadas' });
    expect(res.statusCode).toBe(200);
    const body = MapaCamadasResponseSchema.parse(res.json());
    expect(body.limiares).toEqual({ chuvaAtencaoMmH: 2.5, chuvaAguardarMmH: 7.6, raioAlagamentoM: 300 });
    expect(body.alagamento).toMatchObject({ source: 'geosampa', status: 'fresh', motivo: null });
    expect(body.alagamento.pontos).toHaveLength(1);
    expect(body.clima).toMatchObject({ source: 'open-meteo', status: 'fresh', horaPrevista: '2026-10-13T20:00:00-03:00' });
    expect(body.clima.pontos).toHaveLength(12);
  });

  it('2ª chamada vem do cache (nenhuma ida extra à fonte nem ao banco)', async () => {
    const { app, chamadas } = montarApp();
    await app.inject({ method: 'GET', url: '/v1/mapa/camadas' });
    await app.inject({ method: 'GET', url: '/v1/mapa/camadas' });
    expect(chamadas).toEqual({ clima: 1, banco: 1 });
  });

  it('Open-Meteo fora (503): clima unavailable com motivo; alagamento segue; nunca 500', async () => {
    const { app } = montarApp({ clima: () => jsonResponse('Service Unavailable', 503) });
    const res = await app.inject({ method: 'GET', url: '/v1/mapa/camadas' });
    expect(res.statusCode).toBe(200);
    const body = MapaCamadasResponseSchema.parse(res.json());
    expect(body.clima).toMatchObject({ status: 'unavailable', pontos: [], horaPrevista: null });
    expect(body.clima.motivo).toBeTruthy();
    expect(body.alagamento.pontos).toHaveLength(1);
  });

  it('banco fora: alagamento unavailable com motivo; clima segue', async () => {
    const { app } = montarApp({ bancoFora: true });
    const body = MapaCamadasResponseSchema.parse((await app.inject({ method: 'GET', url: '/v1/mapa/camadas' })).json());
    expect(body.alagamento).toMatchObject({ status: 'unavailable', pontos: [] });
    expect(body.alagamento.motivo).toBeTruthy();
    expect(body.clima.pontos).toHaveLength(12);
  });
});
