// RNF11 / TC30: créditos exigidos pelas fontes, na tela Sobre. A ARTESP exige atribuição e
// licencia os dados em CC BY-NC 4.0 (uso não comercial; cabeçalho `Link` da API, spike de 13/10/2026).
export type Atribuicao = { texto: string; url?: string };

export const TERMOS_ARTESP_URL = 'https://ccm.artesp.sp.gov.br/termos-de-uso-das-apis';

export const ATRIBUICOES: readonly Atribuicao[] = [
  { texto: 'Open-Meteo / CAMS' },
  { texto: 'SPTrans' },
  { texto: 'ARTESP — API Trilhos (CC BY-NC 4.0, uso não comercial)', url: TERMOS_ARTESP_URL },
  { texto: 'Direto do Metrô (metro.sp.gov.br)' },
  { texto: 'GeoSampa' },
  { texto: '© TomTom (rotas e trânsito)' },
  { texto: '© OpenStreetMap' },
];
