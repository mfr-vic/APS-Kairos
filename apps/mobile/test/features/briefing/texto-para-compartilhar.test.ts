// Texto do "Compartilhar" do briefing: todos os blocos em pt-BR e nada inventado.
import { FIXTURES_BRIEFING } from '@/features/briefing/fixtures';
import { textoParaCompartilhar } from '@/features/briefing/texto-para-compartilhar';

import { comObservacao } from '../../support/briefing';
import { transito } from '../../support/transito';

const fixture = (v: string) => FIXTURES_BRIEFING.find((f) => f.briefing.veredito === v)!.briefing;

describe('textoParaCompartilhar', () => {
  it('AGUARDAR: trajeto, veredito, confiança, janela, motivos, dimensões, fontes e hora', () => {
    expect(textoParaCompartilhar('Casa → Trabalho', fixture('AGUARDAR'))).toBe(
      [
        'Καιρός · Casa → Trabalho',
        'Sair agora? Aguardar — Sair agora tem risco; espere a melhor janela.',
        'Confiança média (Status dos trilhos indisponível)',
        'Melhor janela: 11:00–12:00',
        '',
        'Motivos:',
        '• Chuva forte prevista às 09:00 (9,1 mm/h)',
        '• Ponto histórico de alagamento a 120 m do trajeto, com chuva acima de 2,5 mm/h prevista',
        '',
        'Dados:',
        '• Clima: atualizado',
        '• Qualidade do ar: atualizado',
        '• Trilhos: indisponível (Página do Metrô respondeu HTTP 503)',
        '• Alagamento: atualizado',
        '',
        'Fontes: Open-Meteo / CAMS · SPTrans · ARTESP (CC BY-NC 4.0) · Direto do Metrô (metro.sp.gov.br) · GeoSampa · © OpenStreetMap',
        'Gerado às 08:08',
      ].join('\n')
    );
  });

  it('ATENÇÃO: linha da ARTESP fora do normal vai com o texto e a explicação da operadora', () => {
    const t = textoParaCompartilhar('X', fixture('ATENCAO'));
    expect(t).toContain(
      [
        'Metrô e trem:',
        '• Linha 8-Diamante — ARTESP · ViaMobilidade 8 e 9: “Maiores Intervalos”. Devido à atividade de manutenção programada, os trens da Linha 8-Diamante circulam com maiores intervalos entre as estações Barueri e Itapevi.',
        '',
        'Fontes:',
      ].join('\n')
    );
    expect(t).not.toContain('Linha 9-Esmeralda —'); // linha normal não entra
  });

  it('sem motivos, sem janela e sem atribuições: blocos omitidos', () => {
    const t = textoParaCompartilhar('X', fixture('INDETERMINADO'));
    expect(t).toContain('Sem janela favorável nas próximas 6 h');
    expect(t).not.toContain('Motivos:');
    expect(t).not.toContain('Fontes:');
    expect(t.endsWith('Gerado às 08:08')).toBe(true);
  });
});

describe('trânsito no texto compartilhado (RF22)', () => {
  it('inclui nível, atraso e tempos', () => {
    const texto = textoParaCompartilhar('Casa', comObservacao(fixture('FAVORAVEL'), transito()));
    expect(texto).toContain('Trânsito: moderado, +6 min (28 min agora · 22 min sem trânsito)');
    expect(texto).toContain('• Trânsito: atualizado');
  });
});
