// Tiles raster de fluxo de trânsito da TomTom (Traffic API v4, `tile/flow/relative0`, PNG 256 px) para a aba
// Mapa (RF22). Doc: docs.tomtom.com/traffic-api/documentation/tomtom-maps/traffic-flow/raster-flow-tiles.
// O servidor busca o tile com a chave (que fica no .env) e o app só vê /v1/mapa/transito/{z}/{x}/{y}.png.
// Cache próprio (LRU de 300 tiles, 2 min) para os PNGs não expulsarem as entradas do cache do runner, e cota
// própria (≤ 6 000 tiles/24 h e 8/s; RATE_LIMITS.tomtomTiles). Nenhum erro daqui leva URL ou chave.
import { LruCache } from '../../infrastructure/cache/lru-cache.js';
import { systemClock, type Clock } from '../../infrastructure/clock.js';
import { SchemaValidationError } from '../../infrastructure/errors.js';
import { createHttpClient, type HttpClient } from '../../infrastructure/http-client.js';
import { LimiteCota, RATE_LIMITS } from '../../infrastructure/rate-limiter.js';
import { TOMTOM_BASE_URL, erroTomTom } from '../routing/tomtom.adapter.js';

export const TOMTOM_TILES_SOURCE = 'tomtom-tiles';
/** Fluxo muda em minutos; 2 min segura um mapa aberto sem gastar cota a cada arrasto. */
export const TOMTOM_TILE_TTL_S = 2 * 60;
export const TOMTOM_TILE_TIMEOUT_MS = 3_000;
export const TOMTOM_TILE_ESTILO = 'relative0';
const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface TileXYZ {
  z: number;
  x: number;
  y: number;
}

export interface TomTomFlowTilesOptions {
  chave: string;
  http?: HttpClient;
  clock?: Clock;
  baseUrl?: string;
  maxTiles?: number;
}

export class TomTomFlowTiles {
  readonly limiter: LimiteCota;
  private readonly cache: LruCache;
  private readonly http: HttpClient;
  private readonly clock: Clock;
  private readonly baseUrl: string;

  constructor(private readonly o: TomTomFlowTilesOptions) {
    this.clock = o.clock ?? systemClock;
    this.http = o.http ?? createHttpClient();
    this.baseUrl = (o.baseUrl ?? TOMTOM_BASE_URL).replace(/\/+$/, '');
    this.cache = new LruCache({ maxEntries: o.maxTiles ?? 300, staleFactor: 1, clock: this.clock });
    this.limiter = new LimiteCota({ ...RATE_LIMITS.tomtomTiles, clock: this.clock });
  }

  /** PNG do tile (cache de 2 min). Lança ProviderError (sem URL/chave) se a fonte falhar ou a cota acabar. */
  async obter({ z, x, y }: TileXYZ, signal?: AbortSignal): Promise<{ png: Buffer; cache: 'hit' | 'miss' }> {
    const chave = `${z}/${x}/${y}`;
    const hit = await this.cache.get<Buffer>(chave);
    if (hit) return { png: hit.value, cache: 'hit' };
    await this.limiter.acquire(signal);
    const url = `${this.baseUrl}/traffic/map/4/tile/flow/${TOMTOM_TILE_ESTILO}/${z}/${x}/${y}.png?key=${encodeURIComponent(this.o.chave)}&tileSize=256`;
    try {
      const { bytes } = await this.http.requestBytes(url, { signal, timeoutMs: TOMTOM_TILE_TIMEOUT_MS, headers: { Accept: 'image/png' } });
      if (!bytes.subarray(0, 8).equals(ASSINATURA_PNG)) {
        throw new SchemaValidationError([{ path: '(corpo)', message: 'não é PNG' }], `${bytes.length} bytes`);
      }
      await this.cache.set(chave, bytes, TOMTOM_TILE_TTL_S);
      return { png: bytes, cache: 'miss' };
    } catch (err) {
      throw erroTomTom(err, this.o.chave, this.limiter, this.clock);
    }
  }
}
