import { describe, expect, it } from 'vitest';
import { ObservationSchema, type BusLine } from '@kairos/contracts';
import { LruCache } from '../../../src/infrastructure/cache/lru-cache.js';
import { ProviderRunner } from '../../../src/infrastructure/provider-runner.js';
import {
  OlhoVivoAdapter,
  instanteDaReferencia,
  mapearPrevisao,
  minutosAte,
} from '../../../src/providers/transit/olhovivo.adapter.js';
import type { OlhoVivoPrevisaoParada } from '../../../src/providers/transit/olhovivo.schemas.js';
import { FakeClock, jsonResponse, memoryLogger } from '../../infrastructure/helpers.js';
import { clienteFalso, fakeOlhoVivo, fixture } from './olhovivo-fake.js';

const PARADA = 260016861; // CAIO PRADO B/C (spike T04)
const L875A: BusLine = { codigoLinha: 609, letreiro: '875A-10', codigoParada: PARADA };
const L7903: BusLine = { codigoLinha: 512, letreiro: '7903-10', codigoParada: PARADA };
const AUSENTE: BusLine = { codigoLinha: 99999, letreiro: '9999-10', codigoParada: PARADA };

// hr da fixture = "08:07" de 10/10/2026 (America/Sao_Paulo, -03:00)
const AS_08_07_30 = Date.parse('2026-10-10T08:07:30-03:00');

function previsao(hr: string, veiculos: string[], cl = 609): OlhoVivoPrevisaoParada {
  return {
    hr,
    p: { cp: PARADA, np: 'CAIO PRADO B/C', l: [{ c: '875A-10', cl, vs: veiculos.map((t) => ({ t })) }] },
  };
}

describe('mapearPrevisao (T18, RF08)', () => {
  it('fixture real: próxima chegada, minutos a partir de hr e veículos por linha vinculada', () => {
    const raw = fixture<OlhoVivoPrevisaoParada>('fixture-previsao-parada.json');
    const { value, observedAt } = mapearPrevisao(raw, { codigoParada: PARADA, linhas: [L875A, L7903] }, AS_08_07_30);

    expect(value).toEqual({
      codigoParada: PARADA,
      nomeParada: 'CAIO PRADO B/C',
      linhas: [
        // 875A-10: t = 08:20 e 08:30 → 13 min
        { codigoLinha: 609, letreiro: '875A-10', proximaChegada: '2026-10-10T08:20:00-03:00', minutosAteChegada: 13, veiculos: 2 },
        // 7903-10: t = 08:10, 08:46, 08:46 → 3 min
        { codigoLinha: 512, letreiro: '7903-10', proximaChegada: '2026-10-10T08:10:00-03:00', minutosAteChegada: 3, veiculos: 3 },
      ],
    });
    expect(observedAt).toBe('2026-10-10T08:07:30-03:00');
  });

  it('RN07: linha vinculada ausente da resposta → sem previsão e 0 veículos (letreiro do trajeto)', () => {
    const raw = fixture<OlhoVivoPrevisaoParada>('fixture-previsao-parada.json');
    const { value } = mapearPrevisao(raw, { codigoParada: PARADA, linhas: [AUSENTE] }, AS_08_07_30);

    expect(value.linhas).toEqual([
      { codigoLinha: 99999, letreiro: '9999-10', proximaChegada: null, minutosAteChegada: null, veiculos: 0 },
    ]);
  });

  it('parada sem previsão (p = null) → nomeParada null e todas as linhas sem previsão', () => {
    const { value } = mapearPrevisao({ hr: '08:07', p: null }, { codigoParada: PARADA, linhas: [L875A] }, AS_08_07_30);

    expect(value.nomeParada).toBeNull();
    expect(value.linhas[0]).toMatchObject({ proximaChegada: null, minutosAteChegada: null, veiculos: 0 });
  });

  it('linha presente sem veículos (vs = null) → sem previsão', () => {
    const raw: OlhoVivoPrevisaoParada = { hr: '08:07', p: { cp: PARADA, np: 'X', l: [{ c: '875A-10', cl: 609, vs: null }] } };
    const { value } = mapearPrevisao(raw, { codigoParada: PARADA, linhas: [L875A] }, AS_08_07_30);

    expect(value.linhas[0]).toMatchObject({ proximaChegada: null, minutosAteChegada: null, veiculos: 0 });
  });

  it('veículo com t anterior a hr (já passou) é ignorado na próxima chegada, mas conta em veiculos', () => {
    const { value } = mapearPrevisao(previsao('08:07', ['08:05', '08:20']), { codigoParada: PARADA, linhas: [L875A] }, AS_08_07_30);

    expect(value.linhas[0]).toMatchObject({ minutosAteChegada: 13, proximaChegada: '2026-10-10T08:20:00-03:00', veiculos: 2 });
  });

  it('t = hr → 0 min (≥ hr)', () => {
    const { value } = mapearPrevisao(previsao('08:07', ['08:07']), { codigoParada: PARADA, linhas: [L875A] }, AS_08_07_30);
    expect(value.linhas[0]!.minutosAteChegada).toBe(0);
  });

  it('virada da meia-noite: hr 23:50 e t 00:05 → 15 min, chegada no dia seguinte', () => {
    const agora = Date.parse('2026-10-10T23:50:20-03:00');
    const { value, observedAt } = mapearPrevisao(previsao('23:50', ['00:05', '00:20']), { codigoParada: PARADA, linhas: [L875A] }, agora);

    expect(value.linhas[0]).toMatchObject({ minutosAteChegada: 15, proximaChegada: '2026-10-11T00:05:00-03:00' });
    expect(observedAt).toBe('2026-10-10T23:50:20-03:00');
  });

  it('virada da meia-noite: hr 23:59 lido às 00:00:30 do dia seguinte fica no dia anterior', () => {
    const agora = Date.parse('2026-10-11T00:00:30-03:00');
    const { value, observedAt } = mapearPrevisao(previsao('23:59', ['00:02']), { codigoParada: PARADA, linhas: [L875A] }, agora);

    expect(value.linhas[0]).toMatchObject({ minutosAteChegada: 3, proximaChegada: '2026-10-11T00:02:00-03:00' });
    // fim do minuto de hr (23:59 + 1 min), não 24 h no futuro
    expect(observedAt).toBe('2026-10-11T00:00:00-03:00');
  });

  it('observedAt: fim do minuto de hr, limitado a agora (fonte atrasada continua parecendo atrasada)', () => {
    const raw = previsao('08:07', ['08:20']);
    const agora = Date.parse('2026-10-10T08:12:00-03:00');
    expect(mapearPrevisao(raw, { codigoParada: PARADA, linhas: [L875A] }, agora).observedAt).toBe('2026-10-10T08:08:00-03:00');
  });
});

describe('funções de horário (T18)', () => {
  it('minutosAte com virada da meia-noite e veículo que já passou', () => {
    expect(minutosAte('08:07', '08:20')).toBe(13);
    expect(minutosAte('23:50', '00:05')).toBe(15);
    expect(minutosAte('08:07', '08:05')).toBeNull();
    expect(minutosAte('00:05', '23:50')).toBeNull();
  });

  it('instanteDaReferencia usa a ocorrência mais próxima de agora', () => {
    expect(instanteDaReferencia('08:07', AS_08_07_30)).toBe(Date.parse('2026-10-10T08:07:00-03:00'));
    expect(instanteDaReferencia('00:01', Date.parse('2026-10-10T23:59:00-03:00'))).toBe(
      Date.parse('2026-10-11T00:01:00-03:00'),
    );
  });
});

describe('OlhoVivoAdapter + ProviderRunner.observe (T18, RF12)', () => {
  function setup() {
    const clock = new FakeClock(AS_08_07_30);
    const runner = new ProviderRunner({ cache: new LruCache({ clock }), clock });
    const fake = fakeOlhoVivo();
    const adapter = new OlhoVivoAdapter(clienteFalso(fake), clock);
    return { clock, runner, fake, adapter, logger: memoryLogger() };
  }

  it('gera Observation `bus` válida no contrato com uma chamada a /Previsao/Parada', async () => {
    const { runner, fake, adapter, logger } = setup();

    const obs = await runner.observe(adapter, { codigoParada: PARADA, linhas: [L875A, L7903, AUSENTE] }, { logger });

    expect(ObservationSchema.parse(obs)).toMatchObject({
      dimension: 'bus',
      source: 'sptrans-olhovivo',
      status: 'fresh',
      ttlSeconds: 30,
      observedAt: '2026-10-10T08:07:30-03:00',
    });
    expect(obs.value!.linhas.map((l) => l.minutosAteChegada)).toEqual([13, 3, null]);
    const previsoes = fake.chamadasA('/Previsao/Parada');
    expect(previsoes).toHaveLength(1);
    expect(new URL(previsoes[0]!.url).searchParams.get('codigoParada')).toBe(String(PARADA));
  });

  it('TTL de 30 s: segunda consulta em 10 s sai do cache; depois de 31 s vai à fonte de novo', async () => {
    const { clock, runner, fake, adapter, logger } = setup();
    const input = { codigoParada: PARADA, linhas: [L875A] };

    await runner.observe(adapter, input, { logger });
    clock.advance(10_000);
    await runner.observe(adapter, input, { logger });
    expect(fake.chamadasA('/Previsao/Parada')).toHaveLength(1);

    clock.advance(21_000);
    await runner.observe(adapter, input, { logger });
    expect(fake.chamadasA('/Previsao/Parada')).toHaveLength(2);
  });

  it('resposta fora do formato → unavailable com motivo (C.5)', async () => {
    const { runner, fake, adapter, logger } = setup();
    fake.responder('/Previsao/Parada', () => jsonResponse({ hr: '8h07', p: null }));

    const obs = ObservationSchema.parse(await runner.observe(adapter, { codigoParada: PARADA, linhas: [L875A] }, { logger }));

    expect(obs.status).toBe('unavailable');
    expect(obs.motivo).toBe('A fonte respondeu em formato inesperado');
  });

  it('cacheKey não depende da ordem das linhas', () => {
    const { adapter } = setup();
    expect(adapter.cacheKey({ codigoParada: PARADA, linhas: [L875A, L7903] })).toBe(
      adapter.cacheKey({ codigoParada: PARADA, linhas: [L7903, L875A] }),
    );
  });
});
