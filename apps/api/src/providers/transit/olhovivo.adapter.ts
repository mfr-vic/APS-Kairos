// Adaptador da dimensão `bus` (T18, RF08): previsão de chegada das linhas vinculadas num ponto.
// Uma chamada a /Previsao/Parada cobre as até 3 linhas do trajeto (RF02).
import type { BusLine, BusValue } from '@kairos/contracts';
import { systemClock, type Clock } from '../../infrastructure/clock.js';
import type { DimensionProvider, ProviderFetchContext, ProviderResult } from '../../infrastructure/provider.js';
import { OLHO_VIVO_SOURCE, type OlhoVivoClient } from './olhovivo.client.js';
import { OlhoVivoPrevisaoParadaSchema, type OlhoVivoPrevisaoParada } from './olhovivo.schemas.js';

export interface PrevisaoParadaInput {
  codigoParada: number;
  linhas: BusLine[];
}

const MIN_MS = 60_000;
const DIA_MIN = 24 * 60;
const MEIO_DIA_MIN = 12 * 60;
// America/Sao_Paulo não tem horário de verão desde 2019: deslocamento fixo de -03:00 (RNF13)
const DESLOCAMENTO_SP_MS = -3 * 60 * MIN_MS;

function minutosDoDia(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

/** "2026-10-10T08:07:00-03:00" a partir de um instante em ms. */
function isoSaoPaulo(ms: number): string {
  return new Date(ms + DESLOCAMENTO_SP_MS).toISOString().slice(0, 19) + '-03:00';
}

/**
 * Instante de `hr` ("HH:MM", sem data): a ocorrência mais próxima de `agoraMs` (±12 h).
 * Assim, hr = "23:59" lido às 00:00:30 cai no dia anterior, e não 24 h no futuro.
 */
export function instanteDaReferencia(hr: string, agoraMs: number): number {
  const agoraSp = agoraMs + DESLOCAMENTO_SP_MS;
  const meiaNoiteSp = agoraSp - (((agoraSp % (DIA_MIN * MIN_MS)) + DIA_MIN * MIN_MS) % (DIA_MIN * MIN_MS));
  let instanteSp = meiaNoiteSp + minutosDoDia(hr) * MIN_MS;
  const diffMin = (instanteSp - agoraSp) / MIN_MS;
  if (diffMin > MEIO_DIA_MIN) instanteSp -= DIA_MIN * MIN_MS;
  else if (diffMin < -MEIO_DIA_MIN) instanteSp += DIA_MIN * MIN_MS;
  return instanteSp - DESLOCAMENTO_SP_MS;
}

/**
 * Minutos de `hr` até `t` (ambos "HH:MM"), com a virada da meia-noite (hr 23:50, t 00:05 → 15).
 * `null` se `t` é anterior a `hr` (diferença circular > 12 h): o veículo já passou.
 */
export function minutosAte(hr: string, t: string): number | null {
  const delta = (minutosDoDia(t) - minutosDoDia(hr) + DIA_MIN) % DIA_MIN;
  return delta > MEIO_DIA_MIN ? null : delta;
}

/**
 * Converte a resposta de /Previsao/Parada no BusValue do contrato.
 * Para cada linha vinculada: menor `t` ≥ `hr`; `minutosAteChegada` é contado a partir de `hr`
 * (horário de referência da fonte), para o valor não mudar enquanto estiver no cache.
 * Linha vinculada ausente da resposta (ou sem veículos) → sem previsão (RN07).
 */
export function mapearPrevisao(
  raw: OlhoVivoPrevisaoParada,
  input: PrevisaoParadaInput,
  agoraMs: number,
): ProviderResult<BusValue> {
  const referenciaMs = instanteDaReferencia(raw.hr, agoraMs);
  const linhasFonte = raw.p?.l ?? [];

  const linhas = input.linhas.map((vinculada) => {
    const fonte = linhasFonte.find((l) => l.cl === vinculada.codigoLinha);
    const veiculos = fonte?.vs ?? [];
    let menor: number | null = null;
    for (const v of veiculos) {
      const min = minutosAte(raw.hr, v.t);
      if (min !== null && (menor === null || min < menor)) menor = min;
    }
    return {
      codigoLinha: vinculada.codigoLinha,
      letreiro: fonte?.c || vinculada.letreiro,
      proximaChegada: menor === null ? null : isoSaoPaulo(referenciaMs + menor * MIN_MS),
      minutosAteChegada: menor,
      veiculos: veiculos.length,
    };
  });

  // `hr` só tem minutos: o dado foi gerado em algum instante de [hr, hr + 1 min). Usar o fim do minuto
  // (limitado a agora) evita marcar como stale, pelo arredondamento, um dado recém-gerado (TTL de 30 s).
  const observedMs = Math.min(agoraMs, referenciaMs + MIN_MS);
  return {
    value: {
      codigoParada: input.codigoParada,
      nomeParada: raw.p?.np ?? null,
      linhas,
    },
    observedAt: isoSaoPaulo(observedMs),
  };
}

export class OlhoVivoAdapter implements DimensionProvider<PrevisaoParadaInput, 'bus'> {
  readonly source = OLHO_VIVO_SOURCE;
  readonly dimension = 'bus' as const;
  readonly ttlSeconds = 30; // C.5
  readonly timeoutMs = 3_000; // C.5

  constructor(
    private readonly client: OlhoVivoClient,
    private readonly clock: Clock = systemClock,
  ) {}

  cacheKey(input: PrevisaoParadaInput): string {
    const linhas = input.linhas.map((l) => l.codigoLinha).sort((a, b) => a - b);
    return `previsao:${input.codigoParada}:${linhas.join(',')}`;
  }

  async fetch(input: PrevisaoParadaInput, ctx: ProviderFetchContext): Promise<ProviderResult<BusValue>> {
    const raw = await this.client.getJson(
      `/Previsao/Parada?codigoParada=${encodeURIComponent(input.codigoParada)}`,
      OlhoVivoPrevisaoParadaSchema,
      { signal: ctx.signal },
    );
    return mapearPrevisao(raw, input, this.clock.now());
  }
}
