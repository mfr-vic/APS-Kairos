// Construtores de observações para os testes das regras (T24/T25).
// Toda observação passa pelo ObservationSchema, para os testes não usarem dados fora do contrato.
import { ObservationSchema, type DataState, type Observation, type TrajetoRequest } from '@kairos/contracts';

export const AGORA = new Date('2026-10-10T18:08:00-03:00');

type Status = DataState;

function envelope(status: Status, source: string, ttlSeconds: number) {
  return status === 'unavailable'
    ? { source, status, observedAt: null, fetchedAt: null, ttlSeconds, motivo: 'Tempo limite de 3 s excedido' }
    : {
        source,
        status,
        observedAt: '2026-10-10T18:00:00-03:00',
        fetchedAt: '2026-10-10T18:07:55-03:00',
        ttlSeconds,
      };
}

// Série horária com carimbos a partir de `primeiraHora` (ISO -03:00), 1 valor por hora
export function clima(
  precipitacoes: number[],
  { status = 'fresh' as Status, primeiraHora = '2026-10-10T18:00:00-03:00' } = {},
): Observation {
  const inicio = Date.parse(primeiraHora);
  const horas = precipitacoes.map((precipitacaoMm, i) => ({
    hora: new Date(inicio + i * 3_600_000).toISOString(),
    precipitacaoMm,
    probabilidadePrecipitacao: 50,
    temperaturaC: 22,
  }));
  return ObservationSchema.parse({
    dimension: 'weather',
    ...envelope(status, 'open-meteo', 900),
    value:
      status === 'unavailable'
        ? null
        : {
            atual: { temperaturaC: 22, precipitacaoMm: 0, ventoKmH: 8, codigoTempo: 3, sensacaoC: 21, umidadePct: 70, uv: 5 },
            hoje: null,
            sol: null,
            horas,
          },
  });
}

export function ar(pm25Media24h: number | null, status: Status = 'fresh'): Observation {
  return ObservationSchema.parse({
    dimension: 'air',
    ...envelope(status, 'open-meteo-air-quality', 3600),
    value:
      status === 'unavailable'
        ? null
        : { pm25: 20, pm25Media24h, indice: 60, escalaIndice: 'US_AQI', faixa: null, estimativaDeModelo: true },
  });
}

export function onibus(
  linhas: { codigoLinha: number; letreiro: string; minutos: number | null }[],
  status: Status = 'fresh',
): Observation {
  return ObservationSchema.parse({
    dimension: 'bus',
    ...envelope(status, 'sptrans-olhovivo', 30),
    value:
      status === 'unavailable'
        ? null
        : {
            codigoParada: 260016861,
            nomeParada: 'CAIO PRADO B/C',
            linhas: linhas.map((l) => ({
              codigoLinha: l.codigoLinha,
              letreiro: l.letreiro,
              proximaChegada: l.minutos === null ? null : '2026-10-10T18:20:00-03:00',
              minutosAteChegada: l.minutos,
              veiculos: l.minutos === null ? 0 : 1,
            })),
          },
  });
}

export function trilhos(
  linhas: { linha: string; statusTexto: string; situacao: string; detalhe?: string | null }[],
  status: Status = 'fresh',
): Observation {
  return ObservationSchema.parse({
    dimension: 'rail',
    ...envelope(status, 'artesp', 360),
    value: status === 'unavailable' ? null : { linhas: linhas.map((l) => ({ detalhe: null, fonte: 'artesp', ...l })) },
  });
}

export function alagamento(distancias: number[], status: Status = 'fresh'): Observation {
  return ObservationSchema.parse({
    dimension: 'flood',
    ...envelope(status, 'geosampa', 86400),
    value:
      status === 'unavailable'
        ? null
        : {
            raioM: 300,
            pontos: distancias.map((distanciaM, i) => ({
              sourceId: `geosampa:alagamento:${1000 + i}`,
              distanciaM,
              ocorridoEm: '2024-02-10',
              local: 'Sé',
            })),
          },
  });
}

// Trânsito (RF22): `atrasoS` sobre `livreS` de duração sem trânsito; o nível é passado (a regra não recalcula)
export function transito(
  { atrasoS = 0, livreS = 600, nivel = 'LIVRE' }: { atrasoS?: number; livreS?: number; nivel?: string } = {},
  status: Status = 'fresh',
): Observation {
  return ObservationSchema.parse({
    dimension: 'traffic',
    ...envelope(status, 'tomtom', 300),
    value:
      status === 'unavailable'
        ? null
        : { distanciaM: 4073, duracaoLivreS: livreS, duracaoAtualS: livreS + atrasoS, atrasoS, nivel, trechosLentos: [] },
  });
}

export const SEM_TRANSPORTE: Pick<TrajetoRequest, 'onibus' | 'trilhos'> = { onibus: [], trilhos: [] };

export const COM_ONIBUS: Pick<TrajetoRequest, 'onibus' | 'trilhos'> = {
  onibus: [{ codigoLinha: 609, letreiro: '875A-10', codigoParada: 260016861 }],
  trilhos: [],
};

export const COM_TRILHOS: Pick<TrajetoRequest, 'onibus' | 'trilhos'> = { onibus: [], trilhos: ['L9'] };

export const COM_ONIBUS_E_TRILHOS: Pick<TrajetoRequest, 'onibus' | 'trilhos'> = {
  onibus: COM_ONIBUS.onibus,
  trilhos: ['L9'],
};

// Base "tudo tranquilo": sem chuva, ar bom, nenhum ponto de alagamento, trânsito livre
export function base(): Observation[] {
  return [clima([0, 0, 0, 0, 0, 0, 0]), ar(10), alagamento([]), transito()];
}
