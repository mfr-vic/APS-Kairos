// ReportsService contra o PostGIS real (T32, RF26). Tudo numa transação desfeita no fim: o histórico real fica
// intacto. PULADO se o banco não responder ou se a migração 004 não foi aplicada (npm run db:migrate -w apps/api).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ReportsSummaryResponseSchema, type BriefingResponse } from '@kairos/contracts';
import { criarPool } from '../../../src/modules/flood-risk/db.js';
import { hashTrajeto, ReportsService } from '../../../src/modules/reports/reports.service.js';
import { FakeClock } from '../../infrastructure/helpers.js';
import { TRAJETO } from '../briefing/helpers.js';

const envRaiz = fileURLToPath(new URL('../../../../../.env', import.meta.url));
if (!process.env.DB_PASSWORD && existsSync(envRaiz)) process.loadEnvFile(envRaiz);

const pool = criarPool(process.env, { connectionTimeoutMillis: 5000, max: 1 });

async function verificarBanco(): Promise<string | null> {
  try {
    const { rows } = await pool.query<{ t: string }>(
      "SELECT data_type AS t FROM information_schema.columns WHERE table_name = 'briefing_log' AND column_name = 'created_at'",
    );
    return rows[0]?.t === 'timestamp with time zone' ? null : 'migração 004 não aplicada (npm run db:migrate -w apps/api)';
  } catch (err) {
    return `banco inacessível: ${(err as Error).message}`;
  }
}

const motivoPular = await verificarBanco();
if (motivoPular) console.warn(`[reports.integration] testes pulados: ${motivoPular}`);

function resposta(veredito: BriefingResponse['veredito'], railStatus: 'fresh' | 'stale' | 'unavailable'): BriefingResponse {
  return {
    veredito,
    confianca: { nivel: 'ALTA', explicacao: '' },
    observacoes: [
      { dimension: 'weather', source: 'open-meteo', status: 'fresh' },
      { dimension: 'rail', source: 'metro-sp', status: railStatus },
    ],
  } as unknown as BriefingResponse;
}

describe.skipIf(motivoPular !== null)('ReportsService no PostGIS', () => {
  let client: PoolClient;
  beforeAll(async () => {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('DELETE FROM briefing_log'); // desfeito pelo ROLLBACK
  });
  afterAll(async () => {
    await client?.query('ROLLBACK');
    client?.release();
    await pool.end();
  });

  it('grava e agrega: dias em America/Sao_Paulo, percentis, disponibilidade e nada identificável no banco', async () => {
    const clock = new FakeClock(Date.parse('2026-10-14T02:00:00Z')); // 13/10 23:00 em SP
    const svc = new ReportsService(client, clock, 'segredo-integracao');
    await svc.registrar(TRAJETO, resposta('FAVORAVEL', 'fresh'), 1000);
    clock.advance(2 * 3600_000); // 14/10 01:00 em SP
    await svc.registrar(TRAJETO, resposta('ATENCAO', 'stale'), 2000);
    const outro = { ...TRAJETO, trilhos: ['L1' as const] };
    await svc.registrar(outro, resposta('INDETERMINADO', 'unavailable'), 4000);

    const r = await svc.resumo(1);
    expect(ReportsSummaryResponseSchema.parse(r)).toEqual(r);
    expect(r.totalBriefings).toBe(3);
    expect(r.trajetosDistintos).toBe(2);
    expect(r.vereditosPorDia).toEqual([
      { dia: '2026-10-13', FAVORAVEL: 1, ATENCAO: 0, AGUARDAR: 0, INDETERMINADO: 0 },
      { dia: '2026-10-14', FAVORAVEL: 0, ATENCAO: 1, AGUARDAR: 0, INDETERMINADO: 1 },
    ]);
    expect(r.latenciaMs).toEqual({ p50: 2000, p95: 3800, max: 4000 });
    expect(r.disponibilidadePorProvedor).toEqual([
      { provedor: 'metro-sp', consultas: 3, fresh: 1, stale: 1, unavailable: 1, disponibilidadePct: 66.7 },
      { provedor: 'open-meteo', consultas: 3, fresh: 3, stale: 0, unavailable: 0, disponibilidadePct: 100 },
    ]);

    const { rows } = await client.query('SELECT route_hash, verdict, confidence, provider_status::text AS ps FROM briefing_log');
    expect(rows.map((x) => x.route_hash)).toContain(hashTrajeto(TRAJETO, 'segredo-integracao'));
    const tudo = JSON.stringify(rows);
    for (const proibido of ['MASP', 'Praça da Sé', '875A-10', '-23.5', '-46.6']) expect(tudo).not.toContain(proibido);
  });

  it('fora da janela não conta', async () => {
    const svc = new ReportsService(client, new FakeClock(Date.parse('2026-10-20T12:00:00Z')));
    const r = await svc.resumo(1);
    expect(r).toMatchObject({ totalBriefings: 0, latenciaMs: null, vereditosPorDia: [], disponibilidadePorProvedor: [] });
  });
});
