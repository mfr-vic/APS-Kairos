// TC07: RN01–RN08, 1 caso por regra + fronteiras (T24)
import { describe, expect, it } from 'vitest';
import { ReasonSchema, type Observation } from '@kairos/contracts';
import { calcularVeredito, type TrajetoVinculos } from '../../../src/modules/rules/verdict.js';
import { classificarFaixaAr } from '../../../src/modules/rules/air-quality.js';
import { classificarNivelTransito } from '../../../src/modules/rules/traffic.js';
import {
  AGORA,
  COM_ONIBUS,
  COM_ONIBUS_E_TRILHOS,
  COM_TRILHOS,
  SEM_TRANSPORTE,
  alagamento,
  ar,
  base,
  clima,
  onibus,
  transito,
  trilhos,
} from './fixtures.js';

// Troca a observação da mesma dimensão na base
function com(...obs: Observation[]): Observation[] {
  const dims = new Set(obs.map((o) => o.dimension));
  return [...base().filter((o) => !dims.has(o.dimension)), ...obs];
}

function avaliar(observacoes: Observation[], trajeto: TrajetoVinculos = SEM_TRANSPORTE) {
  const r = calcularVeredito(observacoes, trajeto, AGORA);
  for (const m of r.motivos) expect(ReasonSchema.safeParse(m).success).toBe(true);
  return r;
}

// Carimbos 18h, 19h, 20h, 21h…; com agora = 18:08, "próximas 2 h" = carimbos 19h e 20h
const chuvaAs19 = (mm: number) => clima([0, mm, 0, 0, 0, 0, 0]);

describe('RN01/RN02 — chuva nas próximas 2 h', () => {
  it('RN01: 8,1 mm/h às 19h → AGUARDAR com texto legível', () => {
    const r = avaliar(com(chuvaAs19(8.1)));
    expect(r.veredito).toBe('AGUARDAR');
    expect(r.motivos).toEqual([
      { dimensao: 'weather', severidade: 'AGUARDAR', regra: 'RN01', texto: 'Chuva forte prevista (8,1 mm/h às 19h)' },
    ]);
  });

  it('fronteira 7,6 → RN02 (ATENÇÃO); 7,7 → RN01 (AGUARDAR)', () => {
    const r76 = avaliar(com(chuvaAs19(7.6)));
    expect(r76.veredito).toBe('ATENCAO');
    expect(r76.motivos.map((m) => m.regra)).toEqual(['RN02']);
    const r77 = avaliar(com(chuvaAs19(7.7)));
    expect(r77.veredito).toBe('AGUARDAR');
    expect(r77.motivos.map((m) => m.regra)).toEqual(['RN01']);
  });

  it('RN02: 4,2 mm/h às 20h → ATENÇÃO', () => {
    const r = avaliar(com(clima([0, 1, 4.2, 0, 0, 0, 0])));
    expect(r.veredito).toBe('ATENCAO');
    expect(r.motivos[0]?.texto).toBe('Chuva moderada prevista (4,2 mm/h às 20h)');
  });

  it('fronteira 2,5 → FAVORÁVEL sem motivo; 2,6 → RN02', () => {
    const r25 = avaliar(com(chuvaAs19(2.5)));
    expect(r25).toEqual({ veredito: 'FAVORAVEL', motivos: [] });
    const r26 = avaliar(com(chuvaAs19(2.6)));
    expect(r26.veredito).toBe('ATENCAO');
    expect(r26.motivos.map((m) => m.regra)).toEqual(['RN02']);
  });

  it('carimbos fora de (agora, agora + 2 h] são ignorados (18h já passou; 21h está além)', () => {
    const r = avaliar(com(clima([20, 0, 0, 20, 0, 0, 0])));
    expect(r).toEqual({ veredito: 'FAVORAVEL', motivos: [] });
  });

  it('agora + 2 h é inclusivo: agora = 18:00 e chuva no carimbo 20h conta', () => {
    const r = calcularVeredito(com(clima([0, 0, 9, 0, 0, 0, 0])), SEM_TRANSPORTE, new Date('2026-10-10T18:00:00-03:00'));
    expect(r.veredito).toBe('AGUARDAR');
  });

  it('clima stale continua utilizável', () => {
    const r = avaliar(com(clima([0, 9, 0, 0, 0, 0, 0], { status: 'stale' })));
    expect(r.motivos.map((m) => m.regra)).toEqual(['RN01']);
  });
});

describe('RN03/RN04 — alagamento a ≤ 300 m', () => {
  it('RN03: ponto a 120 m + chuva 2,6 → AGUARDAR (dimensão flood), com distância em metros', () => {
    const r = avaliar(com(chuvaAs19(2.6), alagamento([120.4])));
    expect(r.veredito).toBe('AGUARDAR');
    const rn03 = r.motivos.find((m) => m.regra === 'RN03');
    expect(rn03).toMatchObject({ dimensao: 'flood', severidade: 'AGUARDAR' });
    expect(rn03?.texto).toContain('a 120 m do trajeto');
  });

  it('RN04: ponto a 120 m + chuva 2,5 → INFORMATIVO, veredito FAVORÁVEL', () => {
    const r = avaliar(com(chuvaAs19(2.5), alagamento([120])));
    expect(r.veredito).toBe('FAVORAVEL');
    expect(r.motivos).toHaveLength(1);
    expect(r.motivos[0]).toMatchObject({ dimensao: 'flood', severidade: 'INFORMATIVO', regra: 'RN04' });
  });

  it('fronteira 300 m conta; 301 m não', () => {
    expect(avaliar(com(chuvaAs19(5), alagamento([300]))).motivos.map((m) => m.regra)).toEqual(['RN03', 'RN02']);
    expect(avaliar(com(chuvaAs19(5), alagamento([301]))).motivos.map((m) => m.regra)).toEqual(['RN02']);
  });

  it('vários pontos: um motivo só, citando o mais próximo', () => {
    const r = avaliar(com(alagamento([250, 80, 900])));
    expect(r.motivos).toHaveLength(1);
    expect(r.motivos[0]?.texto).toContain('2 pontos históricos de alagamento');
    expect(r.motivos[0]?.texto).toContain('o mais próximo a 80 m');
  });

  it('clima unavailable: alagamento vira só RN04 (não dá para afirmar chuva)', () => {
    const r = avaliar(com(clima([], { status: 'unavailable' }), alagamento([50]), onibus([{ codigoLinha: 609, letreiro: '875A-10', minutos: 5 }])), COM_ONIBUS);
    expect(r.veredito).toBe('FAVORAVEL');
    expect(r.motivos.map((m) => m.regra)).toEqual(['RN04']);
    expect(r.motivos[0]?.texto).toContain('previsão de chuva indisponível');
  });
});

describe('RN05 — MP2,5 média de 24 h', () => {
  it('fronteira 50 → sem motivo; 50,1 → ATENÇÃO (dimensão air)', () => {
    expect(avaliar(com(ar(50)))).toEqual({ veredito: 'FAVORAVEL', motivos: [] });
    const r = avaliar(com(ar(50.1)));
    expect(r.veredito).toBe('ATENCAO');
    expect(r.motivos).toEqual([
      {
        dimensao: 'air',
        severidade: 'ATENCAO',
        regra: 'RN05',
        texto: 'Qualidade do ar ruim (MP2,5 média de 24 h: 50,1 µg/m³, estimativa de modelo)',
      },
    ]);
  });

  it('média null (sem 24 h de dados) não gera motivo', () => {
    expect(avaliar(com(ar(null)))).toEqual({ veredito: 'FAVORAVEL', motivos: [] });
  });

  it('ar unavailable não gera motivo', () => {
    expect(avaliar(com(ar(null, 'unavailable'))).motivos).toEqual([]);
  });
});

describe('faixa do ar (B.8, IQAr MMA)', () => {
  it.each([
    [null, null],
    [0, 'BOA'],
    [15, 'BOA'],
    [15.1, 'MODERADA'],
    [50, 'MODERADA'],
    [50.1, 'RUIM'],
    [75, 'RUIM'],
    [75.1, 'MUITO_RUIM'],
    [125, 'MUITO_RUIM'],
    [125.1, 'PESSIMA'],
    [300, 'PESSIMA'],
    [450, 'PESSIMA'],
  ] as const)('pm25Media24h = %s → %s', (valor, faixa) => {
    expect(classificarFaixaAr(valor)).toBe(faixa);
  });
});

describe('RN06 — trilhos vinculados', () => {
  it('ALTERADA → ATENÇÃO com o texto da fonte', () => {
    const r = avaliar(com(trilhos([{ linha: 'L9', statusTexto: 'Operação Transitória', situacao: 'ALTERADA' }])), COM_TRILHOS);
    expect(r.veredito).toBe('ATENCAO');
    expect(r.motivos).toEqual([
      { dimensao: 'rail', severidade: 'ATENCAO', regra: 'RN06', texto: 'Linha 9 com operação alterada ("Operação Transitória")' },
    ]);
  });

  it('PARALISADA → AGUARDAR', () => {
    const r = avaliar(com(trilhos([{ linha: 'L9', statusTexto: 'Operação paralisada', situacao: 'PARALISADA' }])), COM_TRILHOS);
    expect(r.veredito).toBe('AGUARDAR');
    expect(r.motivos[0]).toMatchObject({ regra: 'RN06', severidade: 'AGUARDAR' });
  });

  it('NORMAL, linha não vinculada, DESCONHECIDA ou rail unavailable → sem motivo', () => {
    const outras = trilhos([
      { linha: 'L9', statusTexto: 'Operação Normal', situacao: 'NORMAL' },
      { linha: 'L8', statusTexto: 'Operação paralisada', situacao: 'PARALISADA' },
    ]);
    expect(avaliar(com(outras), COM_TRILHOS).motivos).toEqual([]);
    const desconhecida = trilhos([{ linha: 'L9', statusTexto: '', situacao: 'DESCONHECIDA' }]);
    expect(avaliar(com(desconhecida), COM_TRILHOS).motivos).toEqual([]);
    expect(avaliar(com(trilhos([], 'unavailable')), COM_TRILHOS).motivos).toEqual([]);
  });
});

describe('RN09 — trânsito no trajeto (decisão de projeto, 14/10/2026)', () => {
  const bus = onibus([{ codigoLinha: 609, letreiro: '875A-10', minutos: 5 }]);

  it('fronteira do atraso: 14 min 59 s (MODERADO) → sem motivo; 15 min → ATENÇÃO com ônibus', () => {
    expect(avaliar(com(bus, transito({ atrasoS: 899, livreS: 3600, nivel: 'MODERADO' })), COM_ONIBUS).motivos).toEqual([]);
    const r = avaliar(com(bus, transito({ atrasoS: 900, livreS: 3600, nivel: 'MODERADO' })), COM_ONIBUS);
    expect(r).toEqual({
      veredito: 'ATENCAO',
      motivos: [
        {
          dimensao: 'traffic',
          severidade: 'ATENCAO',
          regra: 'RN09',
          texto: 'Trânsito moderado no trajeto, 15 min de atraso; o ônibus pega o mesmo trânsito',
        },
      ],
    });
  });

  it('nível INTENSO ou PARADO com atraso curto também dispara', () => {
    for (const nivel of ['INTENSO', 'PARADO']) {
      expect(avaliar(com(bus, transito({ atrasoS: 300, nivel })), COM_ONIBUS).motivos.map((m) => m.regra)).toEqual(['RN09']);
    }
  });

  it('sem ônibus vinculado (só trilhos ou a pé) → INFORMATIVO, veredito não muda', () => {
    for (const trajeto of [COM_TRILHOS, SEM_TRANSPORTE]) {
      const extra = trajeto === COM_TRILHOS ? [trilhos([{ linha: 'L9', statusTexto: 'Operação Normal', situacao: 'NORMAL' }])] : [];
      const r = avaliar(com(...extra, transito({ atrasoS: 1200, nivel: 'PARADO' })), trajeto);
      expect(r.veredito).toBe('FAVORAVEL');
      expect(r.motivos).toEqual([
        { dimensao: 'traffic', severidade: 'INFORMATIVO', regra: 'RN09', texto: 'Trânsito parado no trajeto, 20 min de atraso' },
      ]);
    }
  });

  it('trânsito unavailable ou ausente → sem motivo; stale ainda vale (é dado)', () => {
    expect(avaliar(com(bus, transito({}, 'unavailable')), COM_ONIBUS).motivos).toEqual([]);
    const semTransito = base().filter((o) => o.dimension !== 'traffic');
    expect(avaliar([...semTransito, bus], COM_ONIBUS).motivos).toEqual([]);
    expect(avaliar(com(bus, transito({ atrasoS: 0, nivel: 'INTENSO' }, 'stale')), COM_ONIBUS).motivos[0]).toMatchObject({
      regra: 'RN09',
      texto: 'Trânsito intenso no trajeto; o ônibus pega o mesmo trânsito',
    });
  });

  it('RN09 não troca AGUARDAR por ATENÇÃO e vem depois dos motivos mais graves', () => {
    const r = avaliar(com(bus, chuvaAs19(8.1), transito({ atrasoS: 1800, nivel: 'PARADO' })), COM_ONIBUS);
    expect(r.veredito).toBe('AGUARDAR');
    expect(r.motivos.map((m) => m.regra)).toEqual(['RN01', 'RN09']);
  });
});

describe('nível de trânsito pela razão atual/livre (B.8)', () => {
  it.each([
    [600, 600, 'LIVRE'],
    [689, 600, 'LIVRE'],
    [690, 600, 'MODERADO'], // 1,15
    [899, 600, 'MODERADO'],
    [900, 600, 'INTENSO'], // 1,5
    [1199, 600, 'INTENSO'],
    [1200, 600, 'PARADO'], // 2,0
    [500, 0, 'LIVRE'], // sem base de comparação
  ])('%i s com %i s livres → %s', (atual, livre, nivel) => {
    expect(classificarNivelTransito(atual, livre)).toBe(nivel);
  });
});

describe('RN07 — ônibus vinculados', () => {
  const linha = (minutos: number | null) => onibus([{ codigoLinha: 609, letreiro: '875A-10', minutos }]);

  it('fronteira 20 min → sem motivo; 21 min → ATENÇÃO', () => {
    expect(avaliar(com(linha(20)), COM_ONIBUS)).toEqual({ veredito: 'FAVORAVEL', motivos: [] });
    const r = avaliar(com(linha(21)), COM_ONIBUS);
    expect(r.veredito).toBe('ATENCAO');
    expect(r.motivos).toEqual([
      { dimensao: 'bus', severidade: 'ATENCAO', regra: 'RN07', texto: 'Ônibus 875A-10: próxima chegada em 21 min' },
    ]);
  });

  it('minutos null (sem previsão) → ATENÇÃO', () => {
    const r = avaliar(com(linha(null)), COM_ONIBUS);
    expect(r.veredito).toBe('ATENCAO');
    expect(r.motivos[0]?.texto).toBe('Ônibus 875A-10 sem previsão de chegada');
  });

  it('linha vinculada ausente na previsão da parada → sem previsão (ATENÇÃO)', () => {
    const r = avaliar(com(onibus([{ codigoLinha: 999, letreiro: '9999-10', minutos: 3 }])), COM_ONIBUS);
    expect(r.motivos.map((m) => m.regra)).toEqual(['RN07']);
  });

  it('sem linha vinculada, a previsão é ignorada; bus unavailable não gera motivo', () => {
    expect(avaliar(com(linha(40)), SEM_TRANSPORTE).motivos).toEqual([]);
    expect(avaliar(com(onibus([], 'unavailable')), COM_ONIBUS).motivos).toEqual([]);
  });
});

describe('RN08 — agregação', () => {
  it('FAVORÁVEL sem motivos', () => {
    expect(avaliar(base())).toEqual({ veredito: 'FAVORAVEL', motivos: [] });
  });

  it('AGUARDAR vence ATENÇÃO; motivos ordenados por severidade', () => {
    const r = avaliar(com(chuvaAs19(9), ar(60), alagamento([500])));
    expect(r.veredito).toBe('AGUARDAR');
    expect(r.motivos.map((m) => m.regra)).toEqual(['RN01', 'RN05']);
  });

  it('INFORMATIVO não altera o veredito', () => {
    expect(avaliar(com(alagamento([10]))).veredito).toBe('FAVORAVEL');
  });

  it('INDETERMINADO: clima unavailable e nenhum transporte vinculado', () => {
    const r = avaliar(com(clima([], { status: 'unavailable' }), ar(60)));
    expect(r.veredito).toBe('INDETERMINADO');
    // O motivo do ar continua listado
    expect(r.motivos.map((m) => m.regra)).toEqual(['RN05']);
  });

  it('INDETERMINADO: clima ausente da lista também conta como unavailable', () => {
    expect(avaliar([ar(10), alagamento([])]).veredito).toBe('INDETERMINADO');
  });

  it('INDETERMINADO: clima, ônibus e trilhos vinculados todos unavailable', () => {
    const obs = com(clima([], { status: 'unavailable' }), onibus([], 'unavailable'), trilhos([], 'unavailable'));
    expect(avaliar(obs, COM_ONIBUS_E_TRILHOS).veredito).toBe('INDETERMINADO');
  });

  it('não é INDETERMINADO se algum transporte vinculado estiver disponível', () => {
    const obs = com(
      clima([], { status: 'unavailable' }),
      onibus([{ codigoLinha: 609, letreiro: '875A-10', minutos: 30 }]),
      trilhos([], 'unavailable'),
    );
    const r = avaliar(obs, COM_ONIBUS_E_TRILHOS);
    expect(r.veredito).toBe('ATENCAO');
    expect(r.motivos.map((m) => m.regra)).toEqual(['RN07']);
  });

  it('não é INDETERMINADO com clima disponível, mesmo com todo o transporte unavailable', () => {
    const obs = com(onibus([], 'unavailable'), trilhos([], 'unavailable'));
    expect(avaliar(obs, COM_ONIBUS_E_TRILHOS)).toEqual({ veredito: 'FAVORAVEL', motivos: [] });
  });
});
