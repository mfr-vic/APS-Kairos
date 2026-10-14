// ReportsService (T32, RF26, RNF14): hash do trajeto, linha gravada sem rótulos e montagem do resumo.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ReportsSummaryResponseSchema, type TrajetoRequest } from '@kairos/contracts';
import { hashTrajeto, montarRegistro, ReportsService } from '../../../src/modules/reports/reports.service.js';
import { SQL_INSERIR_BRIEFING } from '../../../src/modules/reports/reports.sql.js';
import { FakeClock } from '../../infrastructure/helpers.js';
import { montarBriefing, TRAJETO } from '../briefing/helpers.js';
import { bancoFalso } from './helpers.js';

const AGORA = Date.parse('2026-10-14T15:00:00.000Z');
const SEGREDO = 'segredo-de-teste-com-32-caracteres!!';

describe('hashTrajeto (RNF14)', () => {
  it('mesmo trajeto e mesmo segredo → mesmo hash (HMAC-SHA-256, 64 hex)', () => {
    expect(hashTrajeto(TRAJETO, SEGREDO)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashTrajeto(structuredClone(TRAJETO), SEGREDO)).toBe(hashTrajeto(TRAJETO, SEGREDO));
  });

  it('origem ~50 m ao norte (dentro da mesma casa de 0,001°) → mesmo hash', () => {
    // -23.5614961 e -23.5610461 arredondam para -23.561
    const perto: TrajetoRequest = { ...TRAJETO, origem: { ...TRAJETO.origem, lat: TRAJETO.origem.lat + 0.00045 } };
    expect(hashTrajeto(perto, SEGREDO)).toBe(hashTrajeto(TRAJETO, SEGREDO));
  });

  it('rótulos, letreiro e ordem dos trilhos não mudam o hash', () => {
    const outro: TrajetoRequest = {
      ...TRAJETO,
      origem: { ...TRAJETO.origem, rotulo: 'Casa da Ana' },
      destino: { ...TRAJETO.destino, rotulo: 'Trabalho' },
      onibus: [{ ...TRAJETO.onibus[0]!, letreiro: 'qualquer' }],
      trilhos: ['L4', 'L2', 'L4'],
    };
    const base: TrajetoRequest = { ...TRAJETO, trilhos: ['L2', 'L4'] };
    expect(hashTrajeto(outro, SEGREDO)).toBe(hashTrajeto(base, SEGREDO));
  });

  it('regressão (14/10): sem o segredo não se reconstrói o hash — força bruta na grade de ~100 m não funciona', () => {
    // Antes era SHA-256 puro: quem lesse o banco recalculava o hash de cada par da grade e achava origem/destino.
    const normal = JSON.stringify({ o: ['-23.561', '-46.656'], d: ['-23.551', '-46.633'], onibus: [], trilhos: [] });
    const semSegredo = createHash('sha256').update(normal).digest('hex');
    const t: TrajetoRequest = { ...TRAJETO, origem: { lat: -23.561, lon: -46.656, rotulo: 'x' }, destino: { lat: -23.551, lon: -46.633, rotulo: 'y' }, onibus: [], trilhos: [] };
    expect(hashTrajeto(t, SEGREDO)).not.toBe(semSegredo);
    expect(hashTrajeto(t, 'outro-segredo')).not.toBe(hashTrajeto(t, SEGREDO));
  });

  it('serviço sem segredo configurado usa um segredo aleatório (dois serviços → hashes diferentes)', async () => {
    const a = bancoFalso();
    const b = bancoFalso();
    const resposta = { veredito: 'FAVORAVEL', confianca: { nivel: 'ALTA' }, observacoes: [] } as never;
    await new ReportsService(a.db, new FakeClock(AGORA)).registrar(TRAJETO, resposta, 10);
    await new ReportsService(b.db, new FakeClock(AGORA)).registrar(TRAJETO, resposta, 10);
    expect(a.chamadas[0]!.valores[1]).not.toBe(b.chamadas[0]!.valores[1]);
  });

  it('~500 m de diferença, outra linha ou destino trocado → hash diferente', () => {
    const h = hashTrajeto(TRAJETO, SEGREDO);
    expect(hashTrajeto({ ...TRAJETO, origem: { ...TRAJETO.origem, lat: TRAJETO.origem.lat + 0.0045 } }, SEGREDO)).not.toBe(h);
    expect(hashTrajeto({ ...TRAJETO, trilhos: ['L1'] }, SEGREDO)).not.toBe(h);
    expect(hashTrajeto({ ...TRAJETO, origem: TRAJETO.destino, destino: TRAJETO.origem }, SEGREDO)).not.toBe(h);
  });
});

describe('ReportsService.registrar', () => {
  it('grava hash, veredito, confiança, estado por fonte e latência — sem rótulos nem coordenadas', async () => {
    const { service, logger } = montarBriefing();
    const resposta = await service.gerar(TRAJETO, logger);
    const { db, chamadas } = bancoFalso();
    await new ReportsService(db, new FakeClock(AGORA), SEGREDO).registrar(TRAJETO, resposta, 1234.6);

    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]!.sql).toBe(SQL_INSERIR_BRIEFING);
    const [criadoEm, hash, veredito, confianca, status, latencia] = chamadas[0]!.valores;
    expect(criadoEm).toBe('2026-10-14T15:00:00.000Z');
    expect(hash).toBe(hashTrajeto(TRAJETO, SEGREDO));
    expect(veredito).toBe('FAVORAVEL');
    expect(confianca).toBe('ALTA');
    expect(latencia).toBe(1235);
    expect(JSON.parse(status as string)).toEqual([
      { dimension: 'weather', source: 'open-meteo', status: 'fresh' },
      { dimension: 'air', source: 'open-meteo-air-quality', status: 'fresh' },
      { dimension: 'flood', source: 'geosampa', status: 'fresh' },
      { dimension: 'traffic', source: 'tomtom', status: 'fresh' },
      { dimension: 'bus', source: 'sptrans-olhovivo', status: 'fresh' },
      { dimension: 'rail', source: 'metro-sp', status: 'fresh' },
    ]);

    const tudo = JSON.stringify(chamadas[0]!.valores);
    for (const proibido of ['MASP', 'Praça da Sé', '875A-10', '-23.56', '-46.65', '-23.55', '-46.63']) {
      expect(tudo).not.toContain(proibido);
    }
  });

  it('montarRegistro não leva latência negativa', () => {
    const r = montarRegistro(TRAJETO, { veredito: 'FAVORAVEL', confianca: { nivel: 'ALTA' }, observacoes: [] } as never, -3, SEGREDO);
    expect(r.latencyMs).toBe(0);
  });
});

describe('ReportsService.resumo', () => {
  it('sem dados → zeros, listas vazias e latenciaMs null; período = últimos N × 24 h', async () => {
    const { db, chamadas } = bancoFalso();
    const r = await new ReportsService(db, new FakeClock(AGORA)).resumo(7);
    expect(ReportsSummaryResponseSchema.parse(r)).toEqual(r);
    expect(r).toEqual({
      periodo: { inicio: '2026-10-07T15:00:00.000Z', fim: '2026-10-14T15:00:00.000Z', dias: 7 },
      totalBriefings: 0,
      trajetosDistintos: 0,
      vereditosPorDia: [],
      disponibilidadePorProvedor: [],
      latenciaMs: null,
    });
    expect(chamadas.every((c) => c.valores[0] === '2026-10-07T15:00:00.000Z' && c.valores[1] === '2026-10-14T15:00:00.000Z')).toBe(true);
  });

  it('com dados → percentis arredondados e disponibilidade = (fresh + stale) / consultas, 1 casa', async () => {
    const { db } = bancoFalso({
      totais: [{ total: 3, distintos: 2, p50: 1100.4, p95: 3890.6, max: 4012 }],
      porDia: [{ dia: '2026-10-14', FAVORAVEL: 2, ATENCAO: 0, AGUARDAR: 0, INDETERMINADO: 1 }],
      provedores: [
        { provedor: 'open-meteo', consultas: 3, fresh: 2, stale: 0, unavailable: 1 },
        { provedor: 'metro-sp', consultas: 3, fresh: 1, stale: 2, unavailable: 0 },
      ],
    });
    const r = await new ReportsService(db, new FakeClock(AGORA)).resumo(1);
    expect(ReportsSummaryResponseSchema.parse(r)).toEqual(r);
    expect(r.totalBriefings).toBe(3);
    expect(r.trajetosDistintos).toBe(2);
    expect(r.latenciaMs).toEqual({ p50: 1100, p95: 3891, max: 4012 });
    expect(r.disponibilidadePorProvedor).toEqual([
      { provedor: 'open-meteo', consultas: 3, fresh: 2, stale: 0, unavailable: 1, disponibilidadePct: 66.7 },
      { provedor: 'metro-sp', consultas: 3, fresh: 1, stale: 2, unavailable: 0, disponibilidadePct: 100 },
    ]);
    expect(r.vereditosPorDia).toHaveLength(1);
  });

  it('banco fora → lança (a rota converte em 503)', async () => {
    const db = { query: async () => Promise.reject(new Error('connect ECONNREFUSED')) };
    await expect(new ReportsService(db, new FakeClock(AGORA)).resumo(7)).rejects.toThrow(/ECONNREFUSED/);
  });
});
