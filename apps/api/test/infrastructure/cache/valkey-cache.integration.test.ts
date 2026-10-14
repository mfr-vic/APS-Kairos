// Integração com um Valkey real (perfil sd-avancado): pulado se não houver Valkey em CACHE_URL
// (padrão redis://127.0.0.1:6379, senha CACHE_PASSWORD ou a padrão do docker-compose).
import { afterAll, describe, expect, it } from 'vitest';
import { ValkeyCache, conectarValkey } from '../../../src/infrastructure/cache/valkey-cache.js';
import { memoryLogger } from '../helpers.js';

const url = process.env.CACHE_URL || 'redis://127.0.0.1:6379';
const logger = memoryLogger();
const client = conectarValkey(url, { password: process.env.CACHE_PASSWORD || 'kairos-cache-123', logger });

async function disponivel(): Promise<boolean> {
  for (let i = 0; i < 20; i++) {
    if (await client.get('kairos:ping').then(() => true, () => false)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}
const temValkey = await disponivel();

describe.skipIf(!temValkey)('ValkeyCache com Valkey real (RF27)', () => {
  const prefixo = `kairos:teste:${process.pid}:`;
  const cache = new ValkeyCache({ client, logger, escritor: 'teste', prefixo });
  afterAll(() => cache.close());

  it('grava, lê, expira o lock e lista a chave quente', async () => {
    await cache.set('open-meteo:x', { n: 1 }, 1);
    expect((await cache.get('open-meteo:x'))?.value).toEqual({ n: 1 });
    expect(await cache.tentarLock('open-meteo:x', 200)).toBe(true);
    expect(await cache.tentarLock('open-meteo:x', 200)).toBe(false);
    cache.registrarQuente({ key: 'open-meteo:x', source: 'open-meteo', ttlSeconds: 1, input: { lat: 1 } });
    await new Promise((r) => setTimeout(r, 1_100));
    expect(await cache.get('open-meteo:x')).toBeUndefined(); // passou do TTL
    expect((await cache.getStale('open-meteo:x'))?.value).toEqual({ n: 1 }); // retido até 3×TTL
    expect(await cache.tentarLock('open-meteo:x', 200)).toBe(true);
    expect(await cache.listarQuentes()).toEqual([{ key: 'open-meteo:x', source: 'open-meteo', ttlSeconds: 1, input: { lat: 1 } }]);
    await cache.delete('open-meteo:x');
    expect(cache.emFallback).toBe(false);
  });
});

afterAll(() => {
  if (!temValkey) void client.quit().catch(() => undefined);
});
