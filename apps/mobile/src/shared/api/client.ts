// Cliente HTTP do app: fetch + timeout + validação Zod da resposta com o contrato (T14).
// Só conversa com o backend Καιρός; nenhuma credencial de provedor passa por aqui (RNF04).
import {
  BriefingResponseSchema,
  BusLinesResponseSchema,
  BusStopsResponseSchema,
  GeocodeResponseSchema,
  HealthSchema,
  ObservationSchema,
  ProvidersHealthResponseSchema,
  RailLinesResponseSchema,
  type BriefingRequest,
  type BriefingResponse,
  type BusLinesResponse,
  type BusStopsResponse,
  type GeocodeResponse,
  type Health,
  type Observation,
  type ProvidersHealthResponse,
  type RailLinesResponse,
} from '@kairos/contracts';
import type { ZodType, ZodTypeDef } from 'zod';

import { apiUrl } from '@/config/api';

import { ApiError, erroDeResposta } from './errors';
import { dimensoesDegradadas, registrar, rotaSemQuery, type EntradaRegistro } from './registro';

/** Prazo global do briefing no servidor é 4 s (C.5); damos folga para a rede. */
export const TIMEOUT_PADRAO_MS = 8000;

type Opcoes = {
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Outro servidor (Testar conexão antes de salvar); padrão: o endereço efetivo. */
  base?: string;
};

/**
 * Exportada para módulos de feature que chamam rotas próprias (ex.: camadas do mapa) sem editar este arquivo.
 * Toda chamada entra no registro de requisições (shared/api/registro.ts), com sucesso ou erro.
 */
export async function requisitar<T>(
  caminho: string,
  schema: ZodType<T, ZodTypeDef, unknown>,
  opcoes: Opcoes = {}
): Promise<T> {
  const em = Date.now();
  const nota: Pick<EntradaRegistro, 'status' | 'bytes' | 'degradadas'> = { status: null, bytes: null, degradadas: null };
  let erro: EntradaRegistro['erro'] = null;
  try {
    return await executar(caminho, schema, opcoes, nota);
  } catch (err) {
    erro = err instanceof ApiError ? err.tipo : 'cancelada';
    throw err;
  } finally {
    registrar({
      em,
      metodo: opcoes.method ?? 'GET',
      rota: rotaSemQuery(caminho),
      erro,
      latenciaMs: Date.now() - em,
      ...nota,
    });
  }
}

async function executar<T>(
  caminho: string,
  schema: ZodType<T, ZodTypeDef, unknown>,
  { method = 'GET', body, signal, timeoutMs = TIMEOUT_PADRAO_MS, base = apiUrl() }: Opcoes,
  nota: Pick<EntradaRegistro, 'status' | 'bytes' | 'degradadas'>
): Promise<T> {
  // Combina o cancelamento do TanStack Query com o timeout (AbortSignal.any pode não existir no Hermes).
  const controller = new AbortController();
  let estourou = false;
  const timer = setTimeout(() => {
    estourou = true;
    controller.abort();
  }, timeoutMs);
  const repassar = () => controller.abort();
  signal?.addEventListener('abort', repassar);

  let res: Response;
  try {
    res = await fetch(`${base}${caminho}`, {
      method,
      headers:
        body === undefined
          ? { Accept: 'application/json' }
          : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (estourou) {
      throw new ApiError('tempo-esgotado', `O servidor do Καιρός não respondeu em ${timeoutMs / 1000} s.`);
    }
    if (signal?.aborted) throw err; // cancelado pelo TanStack Query: repassa como está
    throw new ApiError(
      'rede',
      'Sem conexão com o servidor do Καιρός. Confira a internet ou o Wi-Fi.'
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', repassar);
  }

  nota.status = res.status;
  if (!res.ok) throw await erroDeResposta(res);

  let json: unknown;
  try {
    const texto = await res.text();
    nota.bytes = new TextEncoder().encode(texto).length;
    json = JSON.parse(texto);
  } catch {
    throw new ApiError('contrato', 'O servidor do Καιρός respondeu num formato inesperado.', res.status);
  }
  nota.degradadas = dimensoesDegradadas(json);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    console.warn(`[api] ${caminho} fora do contrato`, parsed.error.issues);
    throw new ApiError('contrato', 'O servidor do Καιρός respondeu num formato que este app não reconhece.', res.status);
  }
  return parsed.data;
}

/** Observation de clima do GET /v1/weather (envelope RF12 com dimension fixa). */
export type ObservacaoTempo = Extract<Observation, { dimension: 'weather' }>;

const ObservacaoTempoSchema = ObservationSchema.refine(
  (o): o is ObservacaoTempo => o.dimension === 'weather',
  { message: "dimension deve ser 'weather'" }
);

export const api = {
  health: (signal?: AbortSignal): Promise<Health> =>
    requisitar('/v1/health', HealthSchema, { signal, timeoutMs: 5000 }),

  /** Testar conexão com um servidor ainda não salvo. */
  healthEm: (base: string): Promise<Health> =>
    requisitar('/v1/health', HealthSchema, { timeoutMs: 5000, base }),

  providers: (signal?: AbortSignal): Promise<ProvidersHealthResponse> =>
    requisitar('/v1/health/providers', ProvidersHealthResponseSchema, { signal, timeoutMs: 5000 }),

  /** Widget "tempo agora": GET /v1/weather devolve a Observation de clima. */
  tempoAgora: (lat: number, lon: number, signal?: AbortSignal): Promise<ObservacaoTempo> =>
    requisitar(`/v1/weather?lat=${lat}&lon=${lon}`, ObservacaoTempoSchema, {
      signal,
      timeoutMs: 5000,
    }) as Promise<ObservacaoTempo>,

  /** RF05: POST /v1/briefings */
  briefing: (pedido: BriefingRequest, signal?: AbortSignal): Promise<BriefingResponse> =>
    requisitar('/v1/briefings', BriefingResponseSchema, { method: 'POST', body: pedido, signal }),

  /** RF01: o servidor espera até 4 s pela fila de 1 req/s do Nominatim. */
  geocode: (q: string, signal?: AbortSignal): Promise<GeocodeResponse> =>
    requisitar(`/v1/geocode?q=${encodeURIComponent(q)}`, GeocodeResponseSchema, { signal }),

  /** RF02 */
  linhasOnibus: (q: string, signal?: AbortSignal): Promise<BusLinesResponse> =>
    requisitar(`/v1/transit/bus/lines?q=${encodeURIComponent(q)}`, BusLinesResponseSchema, {
      signal,
    }),

  paradasOnibus: (codigoLinha: number, signal?: AbortSignal): Promise<BusStopsResponse> =>
    requisitar(`/v1/transit/bus/stops?lineCode=${codigoLinha}`, BusStopsResponseSchema, { signal }),

  /** RF03 */
  linhasTrilho: (signal?: AbortSignal): Promise<RailLinesResponse> =>
    requisitar('/v1/transit/rail/lines', RailLinesResponseSchema, { signal, timeoutMs: 5000 }),
};
