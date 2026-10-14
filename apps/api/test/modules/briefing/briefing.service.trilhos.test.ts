// T19: composição dos trilhos no briefing (ARTESP 4–9 + página do Metrô 1, 2, 3, 15; fallback de 4/5).
import { describe, expect, it } from 'vitest';
import { BriefingResponseSchema, LINHAS_ARTESP, type BriefingResponse, type RailLine } from '@kairos/contracts';
import { HttpStatusError } from '../../../src/infrastructure/errors.js';
import type { DimensionProvider } from '../../../src/infrastructure/provider.js';
import { comporTrilhos } from '../../../src/modules/briefing/briefing.service.js';
import { AGORA_MS, montarBriefing, TRAJETO } from './helpers.js';

const ATRIB_ARTESP = 'ARTESP (CC BY-NC 4.0)';
const ATRIB_METRO = 'Direto do Metrô (metro.sp.gov.br)';

/** ARTESP falsa: L8 com "Maiores Intervalos" e detalhe; demais normais. */
function artespFalsa(o: { falhar?: boolean; idadeS?: number } = {}) {
  const p: DimensionProvider<RailLine[], 'rail'> & { chamadas: number } = {
    dimension: 'rail',
    source: 'artesp',
    ttlSeconds: 360,
    chamadas: 0,
    cacheKey: () => 'status',
    fetch: async () => {
      p.chamadas++;
      if (o.falhar) throw new HttpStatusError(503, 'artesp', 'fora', {});
      return {
        value: {
          linhas: LINHAS_ARTESP.map((linha) =>
            linha === 'L8'
              ? { linha, statusTexto: 'Maiores Intervalos', situacao: 'ALTERADA' as const, detalhe: 'Trens com maiores intervalos.', fonte: 'artesp' }
              : { linha, statusTexto: 'Operação Normal', situacao: 'NORMAL' as const, detalhe: null, fonte: 'artesp' },
          ),
        },
        observedAt: new Date(AGORA_MS - (o.idadeS ?? 0) * 1000).toISOString(),
      };
    },
  };
  return p;
}

function trilhos(b: BriefingResponse) {
  return b.observacoes.find((o) => o.dimension === 'rail')!;
}

describe('Composição dos trilhos (T19, RF09, RF21)', () => {
  it('L2 (Metrô) + L8 (ARTESP) numa observação, cada linha com a sua fonte, e as duas atribuições', async () => {
    const artesp = artespFalsa();
    const { service, logger } = montarBriefing({ reais: { artesp } });
    const b = await service.gerar({ ...TRAJETO, trilhos: ['L8', 'L2'] }, logger);

    expect(BriefingResponseSchema.safeParse(b).success).toBe(true);
    expect(trilhos(b)).toMatchObject({ source: 'artesp+metro-sp', status: 'fresh' });
    expect(trilhos(b).value?.linhas.map((l) => [l.linha, l.fonte, l.detalhe])).toEqual([
      ['L8', 'artesp', 'Trens com maiores intervalos.'],
      ['L2', 'metro-sp', null],
    ]);
    expect(b.atribuicoes).toEqual(expect.arrayContaining([ATRIB_ARTESP, ATRIB_METRO]));
    expect(b.motivos.map((m) => m.regra)).toEqual(['RN06']); // L8 ALTERADA
  });

  it('com chave, L4 vem da ARTESP (precedência) e a página do Metrô não é chamada', async () => {
    const artesp = artespFalsa();
    const { service, logger, reais } = montarBriefing({ reais: { artesp } });
    const b = await service.gerar({ ...TRAJETO, trilhos: ['L4'] }, logger);
    expect(trilhos(b)).toMatchObject({ source: 'artesp', status: 'fresh' });
    expect(trilhos(b).value?.linhas).toEqual([
      { linha: 'L4', statusTexto: 'Operação Normal', situacao: 'NORMAL', detalhe: null, fonte: 'artesp' },
    ]);
    expect(reais.rail.chamadas).toBe(0);
    expect(b.atribuicoes).toContain(ATRIB_ARTESP);
    expect(b.atribuicoes).not.toContain(ATRIB_METRO);
  });

  it('fallback: ARTESP fora → L4 e L5 vêm da página do Metrô; L8 some e a falha vira motivo', async () => {
    const artesp = artespFalsa({ falhar: true });
    const { service, logger } = montarBriefing({ reais: { artesp } });
    const b = await service.gerar({ ...TRAJETO, trilhos: ['L4', 'L8', 'L5'] }, logger);

    expect(BriefingResponseSchema.safeParse(b).success).toBe(true);
    const rail = trilhos(b);
    expect(rail).toMatchObject({ source: 'metro-sp', status: 'fresh', motivo: 'ARTESP: A fonte respondeu com erro (HTTP 503)' });
    expect(rail.value?.linhas.map((l) => [l.linha, l.fonte])).toEqual([
      ['L4', 'metro-sp'],
      ['L5', 'metro-sp'],
    ]);
    expect(b.atribuicoes).toContain(ATRIB_METRO);
    expect(b.atribuicoes).not.toContain(ATRIB_ARTESP);
  });

  it('ARTESP fora e só linhas sem alternativa (L8) → unavailable com o motivo da ARTESP', async () => {
    const { service, logger } = montarBriefing({ reais: { artesp: artespFalsa({ falhar: true }) } });
    const b = await service.gerar({ ...TRAJETO, trilhos: ['L8'] }, logger);
    expect(trilhos(b)).toMatchObject({ source: 'artesp', status: 'unavailable', value: null });
    expect(BriefingResponseSchema.safeParse(b).success).toBe(true);
  });

  it('status = o pior entre as fontes usadas; observedAt = o mais antigo', async () => {
    const artesp = artespFalsa({ idadeS: 8 * 60 }); // > TTL 6 min → stale
    const { service, logger } = montarBriefing({ reais: { artesp } });
    const b = await service.gerar({ ...TRAJETO, trilhos: ['L2', 'L9'] }, logger);
    expect(trilhos(b)).toMatchObject({
      source: 'artesp+metro-sp',
      status: 'stale',
      observedAt: new Date(AGORA_MS - 8 * 60_000).toISOString(),
      ttlSeconds: 360,
      motivo: expect.stringMatching(/8 min/),
    });
  });

  it('sem chave (artesp ausente): L8 sem fonte, nada é chamado', async () => {
    const { service, logger, reais } = montarBriefing();
    const b = await service.gerar({ ...TRAJETO, trilhos: ['L8'] }, logger);
    expect(trilhos(b)).toMatchObject({ status: 'unavailable', motivo: 'Sem fonte configurada para a(s) linha(s) 8' });
    expect(reais.rail.chamadas).toBe(0);
  });

  it('com chave, CPTM (L11) continua sem fonte e some quando há outra linha coberta (B.11)', async () => {
    const { service, logger } = montarBriefing({ reais: { artesp: artespFalsa() } });
    const b = await service.gerar({ ...TRAJETO, trilhos: ['L11', 'L9'] }, logger);
    expect(trilhos(b).value?.linhas.map((l) => l.linha)).toEqual(['L9']);
  });
});

describe('comporTrilhos', () => {
  const base = { dimension: 'rail' as const, ttlSeconds: 300, fetchedAt: '2026-10-13T18:00:00.000Z' };
  it('nenhuma fonte com dado → unavailable com os motivos de cada fonte', () => {
    const r = comporTrilhos(
      [
        { ...base, source: 'artesp', status: 'unavailable', observedAt: null, fetchedAt: null, value: null, motivo: 'A' },
        { ...base, source: 'metro-sp', status: 'unavailable', observedAt: null, fetchedAt: null, value: null, motivo: 'B' },
      ],
      ['L4'],
    );
    expect(r).toMatchObject({ source: 'artesp+metro-sp', status: 'unavailable', value: null, motivo: 'ARTESP: A; Direto do Metrô: B' });
  });
});
