// RNF11 / TC30: créditos das fontes na tela Sobre; a ARTESP exige atribuição e é CC BY-NC 4.0.
import { ATRIBUICOES, TERMOS_ARTESP_URL } from '@/features/sobre/atribuicoes';

describe('ATRIBUICOES', () => {
  it('credita a ARTESP com a licença e o link dos termos', () => {
    const artesp = ATRIBUICOES.find((a) => a.texto.startsWith('ARTESP'));
    expect(artesp?.texto).toContain('CC BY-NC 4.0');
    expect(artesp?.url).toBe('https://ccm.artesp.sp.gov.br/termos-de-uso-das-apis');
    expect(TERMOS_ARTESP_URL).toBe(artesp?.url);
  });

  it('mantém as demais fontes', () => {
    const textos = ATRIBUICOES.map((a) => a.texto).join(' | ');
    // TomTom entrou em 14/10 (RF22/RF24); faltava no Sobre (regressão do TC30)
    for (const f of ['Open-Meteo', 'SPTrans', 'Direto do Metrô', 'GeoSampa', 'TomTom', 'OpenStreetMap']) {
      expect(textos).toContain(f);
    }
  });
});
