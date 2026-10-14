// Filtros e camadas do mapa: leitura do valor salvo, alternância, pontos com valor e impacto, legenda.
import {
  alternarFiltro,
  FILTROS_PADRAO,
  legendaDaCamada,
  lerFiltros,
  pontosDasCamadas,
} from '@/features/map/camadas-mapa';
import { statusColors } from '@/theme';

import { CAMADAS_EXEMPLO } from '../../support/camadas';



describe('lerFiltros / alternarFiltro', () => {
  it('nada salvo ou lixo → padrão; valores desconhecidos são descartados', () => {
    expect(lerFiltros(null)).toEqual(FILTROS_PADRAO);
    expect(lerFiltros('{')).toEqual(FILTROS_PADRAO);
    expect(lerFiltros('"chuva"')).toEqual(FILTROS_PADRAO);
    expect(lerFiltros('["temperatura","vento","alagamento"]')).toEqual(['alagamento', 'temperatura']);
    expect(lerFiltros('[]')).toEqual([]);
  });

  it('liga e desliga mantendo a ordem fixa das camadas', () => {
    expect(alternarFiltro(['chuva'], 'alagamento')).toEqual(['alagamento', 'chuva']);
    expect(alternarFiltro(['alagamento', 'chuva'], 'alagamento')).toEqual(['chuva']);
  });
});

describe('pontosDasCamadas', () => {
  it('só as camadas ligadas; chuva colorida pelo impacto, com valor e regra no toque', () => {
    const ps = pontosDasCamadas(CAMADAS_EXEMPLO, ['chuva']);
    expect(ps).toHaveLength(2);
    expect(ps[0]).toMatchObject({ camada: 'chuva', etiqueta: '0,0 mm/h', cor: statusColors.favoravel });
    expect(ps[0]!.detalhe).toBe('Sé: 0,0 mm/h previstos na hora até 20:00, 22% de chance de chuva. Não pesa no veredito (até 2,5 mm/h).');
    expect(ps[1]).toMatchObject({ etiqueta: '8,2 mm/h', cor: statusColors.aguardar });
    expect(ps[1]!.detalhe).toContain('Aguardar no veredito (acima de 7,6 mm/h, RN01)');
  });

  it('alagamento: bolinha sem etiqueta, data pt-BR e a regra RN03; temperatura informativa', () => {
    const ps = pontosDasCamadas(CAMADAS_EXEMPLO, ['alagamento', 'temperatura']);
    expect(ps.map((p) => p.camada)).toEqual(['alagamento', 'temperatura', 'temperatura']);
    expect(ps[0]!.etiqueta).toBe('');
    expect(ps[0]!.detalhe).toBe(
      'Alagamento registrado em 04/01/2026 · PA - PARELHEIROS. Impacto: se o trajeto passa a até 300 m daqui e a chuva da próxima hora passar de 2,5 mm/h, Aguardar (RN03).'
    );
    expect(ps[1]).toMatchObject({ etiqueta: '20,7 °C' });
    expect(ps[1]!.detalhe).toContain('não pesa no veredito');
  });

  it('escapa HTML vindo do servidor (o toque abre um popup HTML)', () => {
    const d = {
      ...CAMADAS_EXEMPLO,
      alagamento: { ...CAMADAS_EXEMPLO.alagamento, pontos: [{ ...CAMADAS_EXEMPLO.alagamento.pontos[0]!, local: '<img src=x onerror=1>' }] },
    };
    expect(pontosDasCamadas(d, ['alagamento'])[0]!.detalhe).not.toContain('<img');
  });
});

describe('legendaDaCamada', () => {
  it('descreve valor de referência e impacto de cada camada', () => {
    expect(legendaDaCamada('alagamento', CAMADAS_EXEMPLO)).toBe(
      '1 ponto histórico (GeoSampa). Trajeto a até 300 m de um ponto + chuva acima de 2,5 mm/h = Aguardar.'
    );
    expect(legendaDaCamada('chuva', CAMADAS_EXEMPLO)).toBe(
      'Próxima hora (até 20:00): acima de 2,5 mm/h = Atenção; acima de 7,6 mm/h = Aguardar.'
    );
    expect(legendaDaCamada('temperatura', CAMADAS_EXEMPLO)).toContain('Informativa');
  });

  it('fonte fora → motivo; dado velho → avisa', () => {
    const fora = { ...CAMADAS_EXEMPLO, clima: { ...CAMADAS_EXEMPLO.clima, status: 'unavailable' as const, motivo: 'Open-Meteo não respondeu', pontos: [] } };
    expect(legendaDaCamada('chuva', fora)).toBe('Indisponível agora: Open-Meteo não respondeu.');
    const velho = { ...CAMADAS_EXEMPLO, alagamento: { ...CAMADAS_EXEMPLO.alagamento, status: 'stale' as const } };
    expect(legendaDaCamada('alagamento', velho)).toContain('Dados de 19:20 (desatualizados).');
    expect(legendaDaCamada('chuva', undefined)).toBe('');
  });
});

describe('camada Trânsito (RF22)', () => {
  it('não gera pontos nem depende de /v1/mapa/camadas; legenda com as cores da TomTom', async () => {
    const m: typeof import('@/features/map/camadas-mapa') = require('@/features/map/camadas-mapa');
    expect(m.pontosDasCamadas(CAMADAS_EXEMPLO, ['transito'])).toEqual([]);
    expect(m.precisaDeCamadas(['transito'])).toBe(false);
    expect(m.precisaDeCamadas(['transito', 'chuva'])).toBe(true);
    expect(m.legendaDaCamada('transito', undefined)).toContain('© TomTom');
    expect(m.legendaDaCamada('transito', undefined)).toContain('verde = fluindo');
    expect(m.FILTROS_PADRAO).not.toContain('transito'); // cota de tiles: só liga a pedido
  });
});
