// Fonte indisponível em linguagem humana: o motivo genérico da API ganha o nome da fonte.
import {
  detalheDaLinha,
  explicarMotivo,
  fonteDaLinha,
  nomeDaFonte,
  situacaoDaLinha,
} from '@/features/briefing/explicar-fonte';

describe('nomeDaFonte', () => {
  it('nomes curtos e simulação marcada', () => {
    expect(nomeDaFonte('sptrans-olhovivo')).toBe('SPTrans');
    expect(nomeDaFonte('open-meteo-air-quality')).toBe('Open-Meteo (CAMS)');
    expect(nomeDaFonte('simulado:metro-sp')).toBe('Simulação de Direto do Metrô');
    expect(nomeDaFonte('fonte-nova')).toBe('fonte-nova');
  });

  it('contrato 1.3.0: trilhos com duas fontes no mesmo briefing', () => {
    expect(nomeDaFonte('artesp+metro-sp')).toBe('ARTESP e Direto do Metrô');
    expect(nomeDaFonte('simulado:artesp')).toBe('Simulação de ARTESP');
  });
});

describe('fonteDaLinha / situacaoDaLinha (fonte por linha)', () => {
  const l8 = {
    linha: 'L8' as const,
    fonte: 'artesp',
    statusTexto: 'Maiores Intervalos',
    detalhe:
      'Devido à atividade de manutenção programada, os trens da Linha 8-Diamante circulam com maiores intervalos entre as estações Barueri e Itapevi.',
  };

  it('ARTESP cita a operadora da linha; Metrô só a página', () => {
    expect(fonteDaLinha(l8)).toBe('ARTESP · ViaMobilidade 8 e 9');
    expect(fonteDaLinha({ linha: 'L6', fonte: 'artesp' })).toBe('ARTESP · Linha Uni');
    expect(fonteDaLinha({ linha: 'L7', fonte: 'simulado:artesp' })).toBe('Simulação de ARTESP · TIC Trens');
    expect(fonteDaLinha({ linha: 'L4', fonte: 'metro-sp' })).toBe('Direto do Metrô');
  });

  it('texto da fonte + explicação da operadora, sem paráfrase', () => {
    expect(situacaoDaLinha(l8)).toBe(`ARTESP · ViaMobilidade 8 e 9: “Maiores Intervalos”. ${l8.detalhe}`);
    expect(situacaoDaLinha({ ...l8, detalhe: null })).toBe('ARTESP · ViaMobilidade 8 e 9: “Maiores Intervalos”.');
    expect(situacaoDaLinha({ ...l8, statusTexto: ' ', detalhe: null })).toBe(
      'ARTESP · ViaMobilidade 8 e 9: sem texto da fonte.'
    );
  });

  it('detalhe sem ponto final ganha ponto; vazio vira null', () => {
    expect(detalheDaLinha({ detalhe: 'Trecho Barueri–Itapevi' })).toBe('Trecho Barueri–Itapevi.');
    expect(detalheDaLinha({ detalhe: null })).toBeNull();
    expect(detalheDaLinha({ detalhe: '  ' })).toBeNull();
  });
});

describe('explicarMotivo', () => {
  it.each([
    ['sptrans-olhovivo', 'A fonte não respondeu a tempo', 'SPTrans não respondeu a tempo'],
    [
      'sptrans-olhovivo',
      'A fonte não respondeu a tempo; usando dado de 2 min atrás',
      'SPTrans não respondeu a tempo; mostrando o dado de 2 min atrás',
    ],
    ['open-meteo', 'Falha de conexão com a fonte', 'Sem conexão com Open-Meteo'],
    ['metro-sp', 'A fonte respondeu com erro (HTTP 503)', 'Direto do Metrô respondeu com erro (HTTP 503)'],
    [
      'sptrans-olhovivo',
      'Fonte com falhas repetidas; nova tentativa em instantes',
      'SPTrans falhou várias vezes seguidas; o servidor tenta de novo em instantes',
    ],
    [
      'sptrans-olhovivo',
      'Olho Vivo não configurado no servidor (sem SPTRANS_TOKEN)',
      'SPTrans não está configurada neste servidor',
    ],
    [
      'metro-sp',
      'Sem fonte configurada para a(s) linha(s) Linha 7',
      'Nenhuma fonte pública informa a situação de Linha 7',
    ],
    ['open-meteo', 'Tempo limite de 3 s excedido', 'Open-Meteo não respondeu em 3 s'],
    ['open-meteo', 'O último dado da fonte tem 50 min e está antigo demais', 'O último dado de Open-Meteo tem 50 min e está antigo demais'],
  ])('%s: "%s" → "%s"', (source, motivo, esperado) => {
    expect(explicarMotivo(source, motivo)).toBe(esperado);
  });

  it('sem motivo: diz que a fonte não enviou dados', () => {
    expect(explicarMotivo('geosampa', undefined)).toBe('GeoSampa não enviou dados');
  });

  it('motivo desconhecido passa como veio, sem ponto final', () => {
    expect(explicarMotivo('metro-sp', 'Página do Metrô respondeu HTTP 503.')).toBe(
      'Página do Metrô respondeu HTTP 503'
    );
  });
});
