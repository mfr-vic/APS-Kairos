// Gancho do histórico no BriefingService (T32, RF26): fora do caminho crítico e só com fontes reais.
import { describe, expect, it, vi } from 'vitest';
import { BriefingResponseSchema } from '@kairos/contracts';
import { ReportsService } from '../../../src/modules/reports/reports.service.js';
import { FakeClock } from '../../infrastructure/helpers.js';
import { bancoFora, montarBriefing, TRAJETO } from './helpers.js';

const esperarMicrotarefas = () => new Promise((r) => setImmediate(r));

describe('BriefingService → histórico (RF26)', () => {
  it('registra o briefing real com trajeto, resposta e latência', async () => {
    const registrar = vi.fn(async () => {});
    const { service, logger } = montarBriefing({ historico: { registrar } });
    const b = await service.gerar(TRAJETO, logger);
    await esperarMicrotarefas();
    expect(registrar).toHaveBeenCalledTimes(1);
    const [trajeto, resposta, latencia] = registrar.mock.calls[0] as unknown as [unknown, unknown, number];
    expect(trajeto).toBe(TRAJETO);
    expect(resposta).toBe(b);
    expect(latencia).toBeGreaterThanOrEqual(0);
  });

  it('não espera a gravação: registro que nunca termina não segura a resposta', async () => {
    const registrar = vi.fn(() => new Promise<void>(() => {}));
    const { service, logger } = montarBriefing({ historico: { registrar } });
    const b = await service.gerar(TRAJETO, logger);
    expect(BriefingResponseSchema.safeParse(b).success).toBe(true);
  });

  it('banco fora (ReportsService sobre um pg que lança): briefing sai normal e só fica um aviso no log', async () => {
    const { service, logger } = montarBriefing({ historico: new ReportsService(bancoFora, new FakeClock()) });
    const b = await service.gerar(TRAJETO, logger);
    expect(b.veredito).toBe('FAVORAVEL');
    await esperarMicrotarefas();
    expect(logger.lines).toContainEqual(
      expect.objectContaining({ level: 'warn', msg: 'falha ao registrar o briefing no histórico', obj: { erro: expect.stringMatching(/ECONNREFUSED/) } }),
    );
  });

  it('registro que lança de forma síncrona também não derruba o briefing', async () => {
    const registrar = vi.fn((): Promise<void> => {
      throw new Error('quebrou');
    });
    const { service, logger } = montarBriefing({ historico: { registrar } });
    await expect(service.gerar(TRAJETO, logger)).resolves.toBeDefined();
    await esperarMicrotarefas();
    expect(logger.lines.some((l) => l.msg === 'falha ao registrar o briefing no histórico')).toBe(true);
  });

  it('modo demo com cenário ativo (simulado) não registra: não polui a disponibilidade real', async () => {
    const registrar = vi.fn(async () => {});
    const { service, logger } = montarBriefing({ demoMode: true, cenarioDemo: 'normal', historico: { registrar } });
    await service.gerar(TRAJETO, logger);
    await esperarMicrotarefas();
    expect(registrar).not.toHaveBeenCalled();
  });
});
