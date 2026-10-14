import { describe, expect, it } from 'vitest';
import { BusValueSchema } from '@kairos/contracts';
import { LINHA_ONIBUS_PADRAO, PARADA_PADRAO, SimulatedBusAdapter } from '../../../src/providers/simulated/index.js';
import { FakeClock } from '../../infrastructure/helpers.js';
import { fonteControlada } from './helpers.js';

const signal = new AbortController().signal;
const clock = new FakeClock(Date.parse('2026-10-10T18:08:00-03:00'));

describe('SimulatedBusAdapter (T21)', () => {
  it('ecoa as linhas do trajeto ({ onibus }) com a previsão do cenário', async () => {
    const bus = new SimulatedBusAdapter({ fonte: fonteControlada(), clock });
    const trajeto = {
      onibus: [
        { codigoLinha: 609, letreiro: '875A-10', codigoParada: 340015329 },
        { codigoLinha: 1234, letreiro: '702U-10', codigoParada: 340015329 },
      ],
    };

    const valor = BusValueSchema.parse((await bus.fetch(trajeto, { signal })).value);

    expect(valor.codigoParada).toBe(340015329);
    expect(valor.linhas.map((l) => [l.codigoLinha, l.minutosAteChegada])).toEqual([
      [609, 6],
      [1234, 6],
    ]);
    expect(valor.linhas[0]?.proximaChegada).toBe('2026-10-10T18:14:00-03:00');
  });

  it('aceita { codigoParada, linhas } (entrada do adaptador real) e muda o cacheKey conforme as linhas', () => {
    const bus = new SimulatedBusAdapter({ fonte: fonteControlada(), clock });
    const a = bus.cacheKey({ codigoParada: 1, linhas: [{ codigoLinha: 10, letreiro: 'X' }] });
    const b = bus.cacheKey({ codigoParada: 1, linhas: [{ codigoLinha: 11, letreiro: 'Y' }] });
    expect(a).not.toBe(b);
  });

  it('sem linhas na entrada usa a linha padrão; minutos null → sem previsão (RN07)', async () => {
    const bus = new SimulatedBusAdapter({
      fonte: fonteControlada({ bus: { tipo: 'valor', minutosAteChegada: null } }),
      clock,
    });

    const valor = BusValueSchema.parse((await bus.fetch(undefined, { signal })).value);

    expect(valor.codigoParada).toBe(PARADA_PADRAO);
    expect(valor.linhas).toEqual([
      { ...LINHA_ONIBUS_PADRAO, proximaChegada: null, minutosAteChegada: null, veiculos: 0 },
    ]);
  });
});
