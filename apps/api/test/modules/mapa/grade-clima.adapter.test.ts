// Camada de clima do mapa: uma chamada multi-coordenada da Open-Meteo, próxima hora pelo carimbo H+1.
// Fixture REAL capturada em 13/10/2026 19:15 (12 pontos; Sé e Santana caem na mesma célula do modelo).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createHttpClient, type FetchFn } from '../../../src/infrastructure/http-client.js';
import {
  GradeClimaAdapter,
  GradeResponseSchema,
  PONTOS_GRADE,
  impactoChuva,
  mapearGrade,
  montarUrlGrade,
} from '../../../src/modules/mapa/grade-clima.adapter.js';
import { FakeClock, jsonResponse } from '../../infrastructure/helpers.js';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/grade-2026-10-13.json', import.meta.url), 'utf8')) as unknown;
// 19:20 em São Paulo (5 min após current.time)
const AGORA = Date.parse('2026-10-13T22:20:00Z');

function copia() {
  return GradeResponseSchema.parse(structuredClone(FIXTURE));
}

describe('impactoChuva (B.8, comparação ">")', () => {
  it.each([
    [0, 'NAO_PESA'],
    [2.5, 'NAO_PESA'],
    [2.6, 'ATENCAO'],
    [7.6, 'ATENCAO'],
    [7.7, 'AGUARDAR'],
  ] as const)('%s mm/h → %s', (mm, esperado) => {
    expect(impactoChuva(mm)).toBe(esperado);
  });
});

describe('montarUrlGrade', () => {
  it('uma URL só, com as 12 coordenadas em lista', () => {
    const u = new URL(montarUrlGrade());
    expect(u.searchParams.get('latitude')?.split(',')).toHaveLength(PONTOS_GRADE.length);
    expect(u.searchParams.get('longitude')?.split(',')).toHaveLength(PONTOS_GRADE.length);
    expect(u.searchParams.get('hourly')).toBe('precipitation,precipitation_probability');
  });
});

describe('mapearGrade', () => {
  it('fixture real: 12 pontos com a hora 20:00 (carimbo H+1) e a temperatura atual', () => {
    const { value, observedAt } = mapearGrade(copia(), AGORA);
    expect(value.horaPrevista).toBe('2026-10-13T20:00:00-03:00');
    expect(value.pontos).toHaveLength(12);
    expect(value.pontos[0]).toEqual({
      regiao: 'Sé',
      lat: -23.55,
      lon: -46.63,
      temperaturaC: 20.7,
      chuvaProximaHoraMm: 0,
      probabilidadeChuva: 22,
      impactoChuva: 'NAO_PESA',
    });
    expect(value.pontos[10]).toMatchObject({ regiao: 'Itaquera', temperaturaC: 21.6, probabilidadeChuva: 27 });
    // fim do intervalo de 15 min de current (19:30) limitado a agora (19:20)
    expect(observedAt).toBe('2026-10-13T19:20:00-03:00');
  });

  it('chuva na próxima hora vira impacto; ponto sem valor na hora some (não vira zero)', () => {
    const r = copia();
    const k = r[0]!.hourly.time.indexOf('2026-10-13T20:00');
    r[0]!.hourly.precipitation[k] = 8;
    r[1]!.hourly.precipitation[k] = 3;
    r[2]!.hourly.precipitation[k] = null;
    const { value } = mapearGrade(r, AGORA);
    expect(value.pontos.map((p) => p.impactoChuva).slice(0, 2)).toEqual(['AGUARDAR', 'ATENCAO']);
    expect(value.pontos.find((p) => p.regiao === 'Pirituba')).toBeUndefined();
    expect(value.pontos).toHaveLength(11);
  });

  it('nenhum ponto com a próxima hora → erro de schema (o runner devolve unavailable)', () => {
    const r = copia();
    r.forEach((l) => (l.hourly.time = l.hourly.time.map(() => '2020-01-01T00:00')));
    expect(() => mapearGrade(r, AGORA)).toThrow();
  });
});

describe('GradeClimaAdapter', () => {
  it('faz UMA requisição para a grade inteira e rejeita array de tamanho errado', async () => {
    const chamadas: string[] = [];
    let corpo: unknown = FIXTURE;
    const fetch: FetchFn = async (input) => {
      chamadas.push(String(input));
      return jsonResponse(corpo);
    };
    const adapter = new GradeClimaAdapter(createHttpClient({ fetch }), new FakeClock(AGORA));
    const r = await adapter.fetch(undefined, { signal: new AbortController().signal });
    expect(r.value.pontos).toHaveLength(12);
    expect(chamadas).toHaveLength(1);

    corpo = (FIXTURE as unknown[]).slice(0, 3);
    await expect(adapter.fetch(undefined, { signal: new AbortController().signal })).rejects.toThrow();
  });
});
