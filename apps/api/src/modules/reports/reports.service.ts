// Histórico de briefings e relatório agregado (T32, RF26, RNF14, C.6).
// Privacidade: grava só o hash do trajeto (coordenadas arredondadas a 3 casas, ~100 m, + linhas), o veredito,
// a confiança, o estado de cada fonte e a latência. Nunca rótulos, nomes ou coordenadas.
// O hash é HMAC com segredo (correção de 14/10/2026): um SHA-256 puro sobre a grade de ~100 m de SP podia ser
// revertido por força bruta (poucos milhões de pares), revelando origem e destino a quem lesse o banco.
import { createHmac, randomBytes } from 'node:crypto';
import {
  ReportsSummaryResponseSchema,
  type BriefingResponse,
  type LatLon,
  type ReportsSummaryResponse,
  type TrajetoRequest,
} from '@kairos/contracts';
import type { Clock } from '../../infrastructure/clock.js';
import type { Queryable } from '../flood-risk/index.js';
import { SQL_DISPONIBILIDADE, SQL_INSERIR_BRIEFING, SQL_TOTAIS, SQL_VEREDITOS_POR_DIA } from './reports.sql.js';

const DIA_MS = 86_400_000;

/** HMAC-SHA-256 do trajeto normalizado: origem/destino com 3 casas, ônibus (parada:linha) e trilhos ordenados. */
export function hashTrajeto(t: TrajetoRequest, segredo: string | Buffer): string {
  const ponto = (p: LatLon) => [p.lat.toFixed(3), p.lon.toFixed(3)];
  const normal = {
    o: ponto(t.origem),
    d: ponto(t.destino),
    onibus: t.onibus.map((l) => `${l.codigoParada}:${l.codigoLinha}`).sort(),
    trilhos: [...new Set(t.trilhos)].sort(),
  };
  return createHmac('sha256', segredo).update(JSON.stringify(normal)).digest('hex');
}

/** Linha de `briefing_log` (sem id/created_at). */
export function montarRegistro(
  trajeto: TrajetoRequest,
  resposta: BriefingResponse,
  latenciaMs: number,
  segredo: string | Buffer,
) {
  return {
    routeHash: hashTrajeto(trajeto, segredo),
    verdict: resposta.veredito,
    confidence: resposta.confianca.nivel,
    providerStatus: resposta.observacoes.map((o) => ({ dimension: o.dimension, source: o.source, status: o.status })),
    latencyMs: Math.max(0, Math.round(latenciaMs)),
  };
}

export class ReportsService {
  /**
   * `segredo` = HISTORICO_SEGREDO do .env. Sem ele, um segredo aleatório por processo: o hash continua
   * irreversível, mas "trajetos distintos" passa a contar só desde o último boot.
   */
  constructor(
    private readonly db: Queryable,
    private readonly clock: Clock,
    private readonly segredo: string | Buffer = randomBytes(32),
  ) {}

  async registrar(trajeto: TrajetoRequest, resposta: BriefingResponse, latenciaMs: number): Promise<void> {
    const r = montarRegistro(trajeto, resposta, latenciaMs, this.segredo);
    await this.db.query(SQL_INSERIR_BRIEFING, [
      new Date(this.clock.now()).toISOString(),
      r.routeHash,
      r.verdict,
      r.confidence,
      JSON.stringify(r.providerStatus),
      r.latencyMs,
    ]);
  }

  /** Janela móvel: os últimos `dias` × 24 h até agora. Lança se o banco falhar. */
  async resumo(dias: number): Promise<ReportsSummaryResponse> {
    const fim = new Date(this.clock.now());
    const inicio = new Date(fim.getTime() - dias * DIA_MS);
    const periodo = [inicio.toISOString(), fim.toISOString()];
    // Em sequência: não ocupa 3 das 5 conexões do pool compartilhado com o alagamento
    const totais = await this.db.query<{ total: number; distintos: number; p50: number | null; p95: number | null; max: number | null }>(
      SQL_TOTAIS,
      periodo,
    );
    const porDia = await this.db.query(SQL_VEREDITOS_POR_DIA, periodo);
    const provedores = await this.db.query<{ provedor: string; consultas: number; fresh: number; stale: number; unavailable: number }>(
      SQL_DISPONIBILIDADE,
      periodo,
    );
    const t = totais.rows[0] ?? { total: 0, distintos: 0, p50: null, p95: null, max: null };
    return ReportsSummaryResponseSchema.parse({
      periodo: { inicio: inicio.toISOString(), fim: fim.toISOString(), dias },
      totalBriefings: t.total,
      trajetosDistintos: t.distintos,
      vereditosPorDia: porDia.rows,
      disponibilidadePorProvedor: provedores.rows.map((p) => ({
        ...p,
        disponibilidadePct: p.consultas > 0 ? Math.round(((p.fresh + p.stale) / p.consultas) * 1000) / 10 : null,
      })),
      latenciaMs:
        t.total > 0 && t.max !== null
          ? { p50: Math.round(Number(t.p50)), p95: Math.round(Number(t.p95)), max: Number(t.max) }
          : null,
    });
  }
}
