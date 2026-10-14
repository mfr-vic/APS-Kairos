import fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { RailLinesResponseSchema } from '@kairos/contracts';
import { railLinesRoutes } from '../../../src/modules/transit/rail-lines.routes.js';

async function consultar(artespConfigurada?: boolean) {
  const app = fastify();
  await app.register(railLinesRoutes, artespConfigurada === undefined ? {} : { artespConfigurada });
  const res = await app.inject({ method: 'GET', url: '/v1/transit/rail/lines' });
  await app.close();
  return res;
}

describe('GET /v1/transit/rail/lines (RF03, TC04)', () => {
  it('sem chave ARTESP: só 1, 2, 3, 4, 5 e 15, no contrato', async () => {
    const res = await consultar();
    expect(res.statusCode).toBe(200);
    const body = RailLinesResponseSchema.parse(res.json());
    expect(body.linhas.map((l) => l.linha)).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'L15']);
    expect(body.linhas[3]).toEqual({ linha: 'L4', nome: 'Amarela', operadora: 'ViaQuatro' });
  });

  it('artespConfigurada = false explícito dá o mesmo resultado', async () => {
    const res = await consultar(false);
    expect(res.json().linhas).toHaveLength(6);
  });

  it('com chave ARTESP: acrescenta 6–9 com as operadoras da API Trilhos; CPTM (10–13) nunca aparece', async () => {
    const res = await consultar(true);
    const body = RailLinesResponseSchema.parse(res.json());
    expect(body.linhas.map((l) => l.linha)).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L15']);
    expect(body.linhas.some((l) => ['L10', 'L11', 'L12', 'L13'].includes(l.linha))).toBe(false);
    const operadora = Object.fromEntries(body.linhas.map((l) => [l.linha, l.operadora]));
    expect(operadora).toMatchObject({
      L1: 'Metrô',
      L4: 'ViaQuatro',
      L5: 'ViaMobilidade 5',
      L6: 'Linha Uni',
      L7: 'TIC Trens',
      L8: 'ViaMobilidade 8 e 9',
      L9: 'ViaMobilidade 8 e 9',
      L15: 'Metrô',
    });
  });
});
