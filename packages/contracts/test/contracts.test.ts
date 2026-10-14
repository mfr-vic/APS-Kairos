import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BriefingRequestSchema,
  BriefingResponseSchema,
  GeometrySchema,
  MapaCamadasResponseSchema,
  ObservationSchema,
  ProblemDetailsSchema,
  ReasonSchema,
  RotaResponseSchema,
} from '../src/index.js';

describe('contrato 1.5.0 (RF22/RF24, TomTom)', () => {
  // Valores da rota real MASP → Sé de 13/10/2026 22h38 (apps/api/test/providers/routing/fixtures)
  const transito = {
    dimension: 'traffic',
    source: 'tomtom',
    status: 'fresh',
    observedAt: '2026-10-13T22:38:37-03:00',
    fetchedAt: '2026-10-13T22:38:37-03:00',
    ttlSeconds: 300,
    value: { distanciaM: 4073, duracaoLivreS: 586, duracaoAtualS: 597, atrasoS: 0, nivel: 'LIVRE', trechosLentos: [] },
  };

  it('observação traffic valida; nível e magnitude fora do domínio são rejeitados', () => {
    expect(ObservationSchema.safeParse(transito).success).toBe(true);
    const v = transito.value;
    expect(ObservationSchema.safeParse({ ...transito, value: { ...v, nivel: 'CAOS' } }).success).toBe(false);
    const trecho = (magnitude: number) => ({ ...transito, value: { ...v, trechosLentos: [{ atrasoS: 60, comprimentoM: 500, magnitude }] } });
    expect(ObservationSchema.safeParse(trecho(4)).success).toBe(true);
    expect(ObservationSchema.safeParse(trecho(5)).success).toBe(false);
  });

  it('regras RN01–RN19; RN09 com dimensão traffic', () => {
    const r = { dimensao: 'traffic', severidade: 'ATENCAO', texto: 'Trânsito intenso' };
    expect(ReasonSchema.safeParse({ ...r, regra: 'RN09' }).success).toBe(true);
    expect(ReasonSchema.safeParse({ ...r, regra: 'RN19' }).success).toBe(true);
    expect(ReasonSchema.safeParse({ ...r, regra: 'RN20' }).success).toBe(false);
  });

  it('geometria tomtom com distância; linha reta sem distância', () => {
    expect(GeometrySchema.safeParse({ fonte: 'tomtom', coordenadas: [[-46.65615, -23.56168]], distanciaM: 4073 }).success).toBe(true);
    expect(GeometrySchema.safeParse({ fonte: 'linha-reta', coordenadas: [] }).success).toBe(true);
    expect(GeometrySchema.safeParse({ fonte: 'google' }).success).toBe(false);
  });

  it('GET /v1/rota: a pé pela TomTom; linha reta não é fonte aceita', () => {
    const rota = {
      modo: 'a-pe',
      fonte: 'tomtom',
      distanciaM: 3150,
      duracaoS: 2268,
      atrasoTransitoS: null,
      coordenadas: [[-46.65615, -23.56168]],
      observedAt: '2026-10-13T22:38:37-03:00',
    };
    expect(RotaResponseSchema.safeParse(rota).success).toBe(true);
    expect(RotaResponseSchema.safeParse({ ...rota, fonte: 'linha-reta' }).success).toBe(false);
  });
});

function example(name: string): unknown {
  const path = fileURLToPath(new URL(`../examples/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8'));
}

const request = example('briefing-request.json') as { trajeto: Record<string, unknown> };

function withTrajeto(patch: Record<string, unknown>) {
  return { trajeto: { ...request.trajeto, ...patch } };
}

describe('exemplos validam', () => {
  it.each([
    ['briefing-request.json', BriefingRequestSchema],
    ['briefing-response.json', BriefingResponseSchema],
    ['briefing-response-indeterminado.json', BriefingResponseSchema],
    ['problem-400.json', ProblemDetailsSchema],
  ] as const)('%s', (file, schema) => {
    const result = schema.safeParse(example(file));
    expect(result.success, JSON.stringify(!result.success && result.error.issues)).toBe(true);
  });
});

describe('BriefingRequestSchema', () => {
  it('rejeita lat = 200 e destino ausente (TC21)', () => {
    const { destino: _destino, ...semDestino } = request.trajeto;
    const input = { trajeto: { ...semDestino, origem: { lat: 200, lon: -46.6 } } };
    const result = BriefingRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
    expect(paths).toContain('trajeto.origem.lat');
    expect(paths).toContain('trajeto.destino');
  });

  it('aplica rótulo, ônibus e trilhos padrão', () => {
    const parsed = BriefingRequestSchema.parse({
      trajeto: { origem: { lat: -23.55, lon: -46.63 }, destino: { lat: -23.56, lon: -46.65 } },
    });
    expect(parsed.trajeto.origem.rotulo).toBe('Sem rótulo');
    expect(parsed.trajeto.onibus).toEqual([]);
    expect(parsed.trajeto.trilhos).toEqual([]);
  });

  it('aceita até 3 linhas de ônibus e rejeita 4 (RF02)', () => {
    const linha = (codigoLinha: number) => ({ codigoLinha, letreiro: 'X', codigoParada: 260016861 });
    expect(BriefingRequestSchema.safeParse(withTrajeto({ onibus: [1, 2, 3].map(linha) })).success).toBe(true);
    expect(BriefingRequestSchema.safeParse(withTrajeto({ onibus: [1, 2, 3, 4].map(linha) })).success).toBe(false);
  });

  it('rejeita linhas de ônibus em pontos diferentes (RF02)', () => {
    const onibus = [
      { codigoLinha: 609, letreiro: '875A-10', codigoParada: 260016861 },
      { codigoLinha: 33377, letreiro: '875A-10', codigoParada: 340015329 },
    ];
    expect(BriefingRequestSchema.safeParse(withTrajeto({ onibus })).success).toBe(false);
  });

  it('rejeita linha de trilho repetida ou desconhecida', () => {
    expect(BriefingRequestSchema.safeParse(withTrajeto({ trilhos: ['L4', 'L4'] })).success).toBe(false);
    expect(BriefingRequestSchema.safeParse(withTrajeto({ trilhos: ['L14'] })).success).toBe(false);
  });
});

describe('ObservationSchema (RF12)', () => {
  const base = {
    dimension: 'rail',
    source: 'artesp',
    observedAt: null,
    fetchedAt: null,
    ttlSeconds: 360,
    value: null,
  };

  it('unavailable exige motivo', () => {
    expect(ObservationSchema.safeParse({ ...base, status: 'unavailable' }).success).toBe(false);
    expect(ObservationSchema.safeParse({ ...base, status: 'unavailable', motivo: 'sem chave' }).success).toBe(true);
  });

  it('fresh/stale exige value, observedAt e fetchedAt', () => {
    expect(ObservationSchema.safeParse({ ...base, status: 'fresh' }).success).toBe(false);
    const ok = {
      ...base,
      status: 'stale',
      observedAt: '2026-10-10T08:00:00-03:00',
      fetchedAt: '2026-10-10T08:01:00-03:00',
      value: { linhas: [{ linha: 'L4', statusTexto: 'Operação Normal', situacao: 'NORMAL', detalhe: null, fonte: 'artesp' }] },
    };
    expect(ObservationSchema.safeParse(ok).success).toBe(true);
  });

  it('linha de trilho exige detalhe (nullable) e fonte (contrato 1.3.0, T05)', () => {
    const linha = { linha: 'L8', statusTexto: 'Maiores Intervalos', situacao: 'ALTERADA' };
    const obs = (l: object) => ({
      dimension: 'rail',
      source: 'artesp',
      ttlSeconds: 360,
      status: 'fresh',
      observedAt: '2026-10-13T15:04:40-03:00',
      fetchedAt: '2026-10-13T15:04:40-03:00',
      value: { linhas: [l] },
    });
    expect(ObservationSchema.safeParse(obs(linha)).success).toBe(false);
    expect(ObservationSchema.safeParse(obs({ ...linha, detalhe: '', fonte: 'artesp' })).success).toBe(false);
    expect(ObservationSchema.safeParse(obs({ ...linha, detalhe: 'Manutenção entre Barueri e Itapevi', fonte: 'artesp' })).success).toBe(true);
  });

  it('rejeita value com formato de outra dimensão', () => {
    const obs = {
      ...base,
      dimension: 'air',
      status: 'fresh',
      observedAt: '2026-10-10T08:00:00-03:00',
      fetchedAt: '2026-10-10T08:01:00-03:00',
      value: { linhas: [] },
    };
    expect(ObservationSchema.safeParse(obs).success).toBe(false);
  });
});

describe('MapaCamadasResponseSchema (1.4.0, RF23)', () => {
  const base = {
    limiares: { chuvaAtencaoMmH: 2.5, chuvaAguardarMmH: 7.6, raioAlagamentoM: 300 },
    alagamento: {
      source: 'geosampa',
      status: 'fresh',
      observedAt: '2026-10-13T15:00:00-03:00',
      motivo: null,
      pontos: [{ lat: -23.819657, lon: -46.702602, sourceId: 'geosampa:alagamento:19', ocorridoEm: '2026-01-04', local: 'PA - PARELHEIROS' }],
    },
    clima: {
      source: 'open-meteo',
      status: 'unavailable',
      observedAt: null,
      motivo: 'fonte fora do ar',
      horaPrevista: null,
      pontos: [],
    },
  };

  it('aceita camadas com uma fonte fora (pontos vazios e motivo)', () => {
    const r = MapaCamadasResponseSchema.safeParse(base);
    expect(r.success, JSON.stringify(!r.success && r.error.issues)).toBe(true);
  });

  it('rejeita impacto desconhecido e chuva negativa', () => {
    const ponto = { lat: -23.55, lon: -46.63, regiao: 'Sé', temperaturaC: 22, chuvaProximaHoraMm: 0, probabilidadeChuva: 10, impactoChuva: 'NAO_PESA' };
    const com = (p: object) => ({ ...base, clima: { ...base.clima, status: 'fresh', motivo: null, pontos: [p] } });
    expect(MapaCamadasResponseSchema.safeParse(com(ponto)).success).toBe(true);
    expect(MapaCamadasResponseSchema.safeParse(com({ ...ponto, impactoChuva: 'ALTO' })).success).toBe(false);
    expect(MapaCamadasResponseSchema.safeParse(com({ ...ponto, chuvaProximaHoraMm: -1 })).success).toBe(false);
  });
});