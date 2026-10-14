import { describe, expect, it } from 'vitest';
import { LruCache } from '../../../src/infrastructure/cache/lru-cache.js';
import { ProviderRunner } from '../../../src/infrastructure/provider-runner.js';
import { FloodRiskService, type Queryable } from '../../../src/modules/flood-risk/index.js';
import { GeoSampaFloodAdapter } from '../../../src/providers/flood/geosampa-flood.adapter.js';
import { FakeClock, memoryLogger } from '../../infrastructure/helpers.js';

const LINHA: [number, number][] = [
  [-46.6559677, -23.5614961],
  [-46.633081, -23.5503898],
];

describe('GeoSampaFloodAdapter (T27, RF10)', () => {
  it('converte as linhas do PostGIS numa observação flood fresh', async () => {
    const db: Queryable = {
      query: async () =>
        ({
          rows: [{ source_id: 'geosampa:alagamento:1', occurred_on: '2026-02-01', address: 'Sé', distancia_m: 123.44 }],
        }) as never,
    };
    const clock = new FakeClock();
    const runner = new ProviderRunner({ cache: new LruCache({ clock }), clock });
    const obs = await runner.observe(new GeoSampaFloodAdapter(new FloodRiskService(db)), LINHA, {
      logger: memoryLogger(),
    });
    expect(obs).toMatchObject({
      source: 'geosampa',
      status: 'fresh',
      value: {
        raioM: 300,
        pontos: [{ sourceId: 'geosampa:alagamento:1', distanciaM: 123.4, ocorridoEm: '2026-02-01', local: 'Sé' }],
      },
    });
  });

  it('banco fora do ar → unavailable com motivo (sem lançar)', async () => {
    const db: Queryable = {
      query: async () => {
        throw new Error('connect ECONNREFUSED');
      },
    };
    const runner = new ProviderRunner({ cache: new LruCache() });
    const obs = await runner.observe(new GeoSampaFloodAdapter(new FloodRiskService(db)), LINHA, {
      logger: memoryLogger(),
    });
    expect(obs).toMatchObject({ status: 'unavailable', value: null, motivo: 'Falha de conexão com a fonte' });
  });

  it('cacheKey estável e curta para geometrias longas', () => {
    const a = new GeoSampaFloodAdapter({ pontosProximos: async () => ({ raioM: 300, pontos: [] }) });
    const longa = Array.from({ length: 5000 }, (_, i): [number, number] => [-46.6 + i * 1e-5, -23.5]);
    expect(a.cacheKey(longa)).toHaveLength(40);
    expect(a.cacheKey(LINHA)).toBe(a.cacheKey([...LINHA]));
    expect(a.cacheKey(LINHA)).not.toBe(a.cacheKey(longa));
  });
});
