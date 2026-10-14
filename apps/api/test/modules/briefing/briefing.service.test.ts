import { afterEach, describe, expect, it, vi } from 'vitest';
import { BriefingResponseSchema, type BriefingResponse, type Dimension } from '@kairos/contracts';
import { ATRIBUICAO_SIMULADO, PRAZO_BRIEFING_MS } from '../../../src/modules/briefing/briefing.service.js';
import { floodComBancoFora, montarBriefing, TRAJETO, comFonte, tomtomFalsa } from './helpers.js';

function estado(b: BriefingResponse, d: Dimension) {
  return b.observacoes.find((o) => o.dimension === d);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('BriefingService (T27, RF05, RF15)', () => {
  it('cenário normal → FAVORAVEL, confiança ALTA, 6 dimensões fresh e resposta no contrato', async () => {
    const { service, logger } = montarBriefing();
    const b = await service.gerar(TRAJETO, logger);

    expect(BriefingResponseSchema.safeParse(b).success).toBe(true);
    expect(b.veredito).toBe('FAVORAVEL');
    expect(b.confianca.nivel).toBe('ALTA');
    expect(b.observacoes.map((o) => [o.dimension, o.status])).toEqual([
      ['weather', 'fresh'],
      ['air', 'fresh'],
      ['flood', 'fresh'],
      ['traffic', 'fresh'],
      ['bus', 'fresh'],
      ['rail', 'fresh'],
    ]);
    expect(b.geradoEm).toBe('2026-10-10T21:08:00.000Z');
    // trilhos recortados para a linha vinculada
    expect(estado(b, 'rail')?.value).toEqual({ linhas: [{ linha: 'L4', statusTexto: 'Operação Normal', situacao: 'NORMAL', detalhe: null, fonte: 'metro-sp' }] });
  });

  it('atribuições: só fontes usadas; sem TomTom nem OSRM não cita nenhum dos dois; Metrô citado', async () => {
    const { service, logger } = montarBriefing({ tomtom: null });
    const b = await service.gerar(TRAJETO, logger);
    expect(b.geometria.fonte).toBe('linha-reta');
    expect(b.atribuicoes).toEqual(['Open-Meteo / CAMS', 'GeoSampa', 'SPTrans', 'Direto do Metrô (metro.sp.gov.br)']);
  });

  it('sem TOMTOM_KEY + OSRM ok: geometria osrm com distância, "© OpenStreetMap"; traffic unavailable por configuração', async () => {
    const { service, logger } = montarBriefing({ osrmFalha: false, tomtom: null });
    const b = await service.gerar(TRAJETO, logger);
    expect(b.geometria).toMatchObject({ fonte: 'osrm', distanciaM: 3000 });
    expect(b.geometria.coordenadas).toHaveLength(3);
    expect(b.atribuicoes).toContain('© OpenStreetMap');
    expect(estado(b, 'traffic')).toMatchObject({ source: 'tomtom', status: 'unavailable', value: null, motivo: expect.stringMatching(/TOMTOM_KEY/) });
    // Com ônibus vinculado o trânsito conta na confiança (RN09 pesa no veredito)
    expect(b.confianca).toEqual({ nivel: 'MEDIA', explicacao: expect.stringMatching(/^Sem dados de trânsito/) });
  });

  it('TomTom ok: geometria e trânsito da MESMA chamada, "© TomTom", OSRM nem chamado', async () => {
    const tomtom = tomtomFalsa();
    const { service, logger, runner } = montarBriefing({ osrmFalha: false, tomtom });
    const b = await service.gerar(TRAJETO, logger);
    expect(b.geometria).toMatchObject({ fonte: 'tomtom', distanciaM: 4000 });
    expect(estado(b, 'traffic')).toMatchObject({
      source: 'tomtom',
      status: 'fresh',
      ttlSeconds: 300,
      value: { distanciaM: 4000, duracaoLivreS: 600, duracaoAtualS: 660, atrasoS: 60, nivel: 'LIVRE', trechosLentos: [] },
    });
    expect(b.atribuicoes).toContain('© TomTom');
    expect(b.atribuicoes).not.toContain('© OpenStreetMap');
    expect(tomtom.chamadas).toBe(1);
    expect(runner.health().map((h) => h.source)).not.toContain('osrm');
  });

  it('TomTom fora → geometria pelo OSRM e traffic unavailable com o motivo da fonte', async () => {
    const { service, logger } = montarBriefing({ osrmFalha: false, tomtom: tomtomFalsa({ falhar: true }) });
    const b = await service.gerar(TRAJETO, logger);
    expect(b.geometria.fonte).toBe('osrm');
    expect(estado(b, 'traffic')).toMatchObject({ status: 'unavailable', motivo: 'Falha de conexão com a fonte' });
  });

  it('cache: 2º briefing do mesmo trajeto não chama a TomTom de novo (TTL 5 min)', async () => {
    const tomtom = tomtomFalsa();
    const { service, logger, clock } = montarBriefing({ tomtom });
    await service.gerar(TRAJETO, logger);
    await service.gerar(TRAJETO, logger);
    expect(tomtom.chamadas).toBe(1);
    clock.advance(301_000);
    await service.gerar(TRAJETO, logger);
    expect(tomtom.chamadas).toBe(2);
  });

  it('RN09: atraso de 20 min com ônibus vinculado → ATENÇÃO', async () => {
    const { service, logger } = montarBriefing({ tomtom: tomtomFalsa({ atrasoS: 1200 }) });
    const b = await service.gerar(TRAJETO, logger);
    expect(b.veredito).toBe('ATENCAO');
    expect(b.motivos).toEqual([expect.objectContaining({ dimensao: 'traffic', regra: 'RN09', severidade: 'ATENCAO' })]);
    expect(estado(b, 'traffic')?.value).toMatchObject({ nivel: 'PARADO', atrasoS: 1200 });
  });

  it('chuva forte → AGUARDAR com RN01', async () => {
    const { service, logger } = montarBriefing({ cenarioReais: 'chuva-forte' });
    const b = await service.gerar(TRAJETO, logger);
    expect(b.veredito).toBe('AGUARDAR');
    expect(b.motivos.map((m) => m.regra)).toEqual(['RN01']);
    expect(BriefingResponseSchema.safeParse(b).success).toBe(true);
  });

  it('fonte lenta: o prazo global de 4 s corta só ela, sem travar as outras (fake timers)', async () => {
    vi.useFakeTimers();
    const ctx = montarBriefing();
    // timeout próprio de 10 s: quem corta é o prazo do briefing, não o timeout do provedor
    const lento = comFonte(ctx.reais.weather, 'open-meteo', 10_000);
    lento.fetch = (_i, c) =>
      new Promise((_, reject) => c.signal.addEventListener('abort', () => reject(new Error('abortado')), { once: true }));
    const { service, logger } = montarBriefing({ reais: { weather: lento } });

    let pronto = false;
    const promessa = service.gerar(TRAJETO, logger).then((b) => {
      pronto = true;
      return b;
    });
    await vi.advanceTimersByTimeAsync(PRAZO_BRIEFING_MS - 1);
    expect(pronto).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const b = await promessa;

    expect(estado(b, 'weather')).toMatchObject({ status: 'unavailable', motivo: expect.stringMatching(/Prazo do briefing/) });
    for (const d of ['air', 'flood', 'bus', 'rail'] as const) expect(estado(b, d)?.status).toBe('fresh');
    expect(b.confianca.nivel).toBe('BAIXA'); // clima unavailable (C3)
    expect(BriefingResponseSchema.safeParse(b).success).toBe(true);
    expect(vi.getTimerCount()).toBe(0); // o timer do prazo foi limpo
  });

  it('banco indisponível → flood unavailable (sem lançar) e GeoSampa fora das atribuições', async () => {
    const { service, logger } = montarBriefing({ reais: { flood: floodComBancoFora() } });
    const b = await service.gerar(TRAJETO, logger);
    expect(estado(b, 'flood')).toMatchObject({ source: 'geosampa', status: 'unavailable', motivo: expect.any(String) });
    expect(b.veredito).toBe('FAVORAVEL');
    expect(b.confianca.nivel).toBe('MEDIA');
    expect(b.atribuicoes).not.toContain('GeoSampa');
    expect(BriefingResponseSchema.safeParse(b).success).toBe(true);
  });

  it('trilho fora de cobertura (L7) → rail unavailable com motivo, sem chamar a página do Metrô', async () => {
    const { service, logger, reais } = montarBriefing();
    const b = await service.gerar({ ...TRAJETO, trilhos: ['L7'] }, logger);
    expect(estado(b, 'rail')).toMatchObject({
      status: 'unavailable',
      value: null,
      motivo: 'Sem fonte configurada para a(s) linha(s) 7',
    });
    expect(reais.rail.chamadas).toBe(0);
    expect(b.atribuicoes).not.toContain('Direto do Metrô (metro.sp.gov.br)');
    expect(BriefingResponseSchema.safeParse(b).success).toBe(true);
  });

  it('linhas mistas (L4 + L7): só a coberta entra no valor', async () => {
    const { service, logger } = montarBriefing();
    const b = await service.gerar({ ...TRAJETO, trilhos: ['L4', 'L7'] }, logger);
    expect(estado(b, 'rail')?.value).toEqual({ linhas: [{ linha: 'L4', statusTexto: 'Operação Normal', situacao: 'NORMAL', detalhe: null, fonte: 'metro-sp' }] });
  });

  it('sem SPTRANS_TOKEN (bus = null) → ônibus unavailable com motivo de configuração', async () => {
    const { service, logger } = montarBriefing({ reais: { bus: null } });
    const b = await service.gerar(TRAJETO, logger);
    expect(estado(b, 'bus')).toMatchObject({ status: 'unavailable', motivo: expect.stringMatching(/SPTRANS_TOKEN/) });
    expect(BriefingResponseSchema.safeParse(b).success).toBe(true);
  });

  it('trajeto sem ônibus nem trilhos: weather, air, flood e traffic', async () => {
    const { service, logger } = montarBriefing();
    const b = await service.gerar({ ...TRAJETO, onibus: [], trilhos: [] }, logger);
    expect(b.observacoes.map((o) => o.dimension)).toEqual(['weather', 'air', 'flood', 'traffic']);
  });

  it('erro inesperado de um provedor vira unavailable da dimensão', async () => {
    const { reais } = montarBriefing();
    const quebrado = comFonte(reais.air, 'open-meteo-air-quality');
    quebrado.cacheKey = () => {
      throw new Error('bug');
    };
    const { service, logger } = montarBriefing({ reais: { air: quebrado } });
    const b = await service.gerar(TRAJETO, logger);
    expect(estado(b, 'air')).toMatchObject({ status: 'unavailable', motivo: 'Erro inesperado ao consultar a fonte' });
  });

  it('demo ligada com cenário ≠ real usa os simulados e cita "Dados simulados"', async () => {
    const { service, logger, reais } = montarBriefing({ demoMode: true, cenarioDemo: 'chuva-forte' });
    const b = await service.gerar(TRAJETO, logger);
    expect(b.veredito).toBe('AGUARDAR');
    expect(b.observacoes.every((o) => o.source.startsWith('simulado:'))).toBe(true);
    // A geometria continua real (TomTom) na demo: a atribuição dela aparece
    expect(b.atribuicoes).toEqual([ATRIBUICAO_SIMULADO, '© TomTom']);
    expect(reais.weather.chamadas).toBe(0);
  });

  it('DEMO_MODE=false ignora o cenário ativo (sempre os reais)', async () => {
    const { service, logger } = montarBriefing({ demoMode: false, cenarioDemo: 'chuva-forte' });
    const b = await service.gerar(TRAJETO, logger);
    expect(b.veredito).toBe('FAVORAVEL');
    expect(b.atribuicoes).not.toContain(ATRIBUICAO_SIMULADO);
  });

  it('trilho paralisado no simulado vale para a linha vinculada (L4), não para a L1', async () => {
    const { service, logger } = montarBriefing({ demoMode: true, cenarioDemo: 'trilho-paralisado' });
    const b = await service.gerar(TRAJETO, logger);
    expect(b.motivos).toEqual([expect.objectContaining({ regra: 'RN06', severidade: 'AGUARDAR', texto: expect.stringMatching(/Linha 4/) })]);
  });
});
