// Fixtures de briefing para desenvolvimento e verificação visual (T15): um por veredito.
// Todas passam pelo BriefingResponseSchema ao carregar; uma fixture fora do contrato
// derruba a tela de exemplos em vez de mostrar dado inválido.
//
// FAVORAVEL e INDETERMINADO são os exemplos oficiais do contrato (packages/contracts/examples).
// ATENCAO e AGUARDAR são FICTÍCIOS, montados à mão para exercitar as regras RN01/RN03/RN05/RN07
// e os estados stale/unavailable — não são medições reais. A exceção é o texto da Linha 8 em
// ATENCAO: situação e explicação copiadas da API Trilhos da ARTESP em 13/10/2026 15:04
// (spikes/artesp/fixture-status.json), num briefing fictício de 10/10.
import { BriefingResponseSchema, type BriefingResponse } from '@kairos/contracts';

import exemploFavoravel from '../../../../../packages/contracts/examples/briefing-response.json';
import exemploIndeterminado from '../../../../../packages/contracts/examples/briefing-response-indeterminado.json';

const ATRIBUICOES = [
  'Open-Meteo / CAMS',
  'SPTrans',
  'ARTESP (CC BY-NC 4.0)',
  'Direto do Metrô (metro.sp.gov.br)',
  'GeoSampa',
  '© OpenStreetMap',
];

const atencao = {
  briefingId: '6b0f6a52-4c1d-4e0b-9a51-2f7d1c3e8a10',
  geradoEm: '2026-10-10T08:08:00-03:00',
  veredito: 'ATENCAO',
  motivos: [
    {
      dimensao: 'air',
      severidade: 'ATENCAO',
      regra: 'RN05',
      texto: 'Média de PM2,5 nas últimas 24 h acima de 50 µg/m³ (estimativa de modelo)',
    },
    {
      dimensao: 'bus',
      severidade: 'ATENCAO',
      regra: 'RN07',
      texto: '875A-10 sem previsão de chegada',
    },
    {
      dimensao: 'rail',
      severidade: 'ATENCAO',
      regra: 'RN06',
      texto: 'Linha 8 com operação alterada ("Maiores Intervalos")',
    },
  ],
  // RN05 ativa → sem janela (B.8)
  janelaMeteorologica: null,
  confianca: { nivel: 'MEDIA', explicacao: 'Clima desatualizado' },
  observacoes: [
    {
      dimension: 'weather',
      source: 'open-meteo',
      status: 'stale',
      observedAt: '2026-10-10T07:30:00-03:00',
      fetchedAt: '2026-10-10T07:31:00-03:00',
      ttlSeconds: 900,
      value: {
        atual: {
          temperaturaC: 19.0,
          precipitacaoMm: 0.4,
          ventoKmH: 11.2,
          codigoTempo: 3,
          sensacaoC: 18.1,
          umidadePct: 88,
          uv: 1.4,
        },
        hoje: { temperaturaMaxC: 23, temperaturaMinC: 16 },
        sol: { nascer: '2026-10-10T05:48:00-03:00', por: '2026-10-10T18:12:00-03:00' },
        horas: [
          {
            hora: '2026-10-10T09:00:00-03:00',
            precipitacaoMm: 0.6,
            probabilidadePrecipitacao: 40,
            temperaturaC: 19.5,
          },
          {
            hora: '2026-10-10T10:00:00-03:00',
            precipitacaoMm: 1.1,
            probabilidadePrecipitacao: 55,
            temperaturaC: 20.1,
          },
        ],
      },
    },
    {
      dimension: 'air',
      source: 'open-meteo-air-quality',
      status: 'fresh',
      observedAt: '2026-10-10T08:00:00-03:00',
      fetchedAt: '2026-10-10T08:07:56-03:00',
      ttlSeconds: 3600,
      value: {
        pm25: 61.2,
        pm25Media24h: 55.3,
        indice: 154,
        escalaIndice: 'US_AQI',
        faixa: 'RUIM',
        estimativaDeModelo: true,
      },
    },
    {
      dimension: 'bus',
      source: 'sptrans-olhovivo',
      status: 'fresh',
      observedAt: '2026-10-10T08:07:00-03:00',
      fetchedAt: '2026-10-10T08:07:06-03:00',
      ttlSeconds: 30,
      value: {
        codigoParada: 260016861,
        nomeParada: 'CAIO PRADO B/C',
        linhas: [
          {
            codigoLinha: 609,
            letreiro: '875A-10',
            proximaChegada: null,
            minutosAteChegada: null,
            veiculos: 0,
          },
        ],
      },
    },
    {
      dimension: 'flood',
      source: 'geosampa',
      status: 'fresh',
      observedAt: '2026-10-10T08:08:00-03:00',
      fetchedAt: '2026-10-10T08:08:00-03:00',
      ttlSeconds: 86400,
      value: { raioM: 300, pontos: [] },
    },
    {
      dimension: 'rail',
      source: 'artesp',
      status: 'fresh',
      observedAt: '2026-10-10T08:07:00-03:00',
      fetchedAt: '2026-10-10T08:07:58-03:00',
      ttlSeconds: 360,
      value: {
        linhas: [
          {
            linha: 'L8',
            statusTexto: 'Maiores Intervalos',
            situacao: 'ALTERADA',
            detalhe:
              'Devido à atividade de manutenção programada, os trens da Linha 8-Diamante circulam com maiores intervalos entre as estações Barueri e Itapevi.',
            fonte: 'artesp',
          },
          {
            linha: 'L9',
            statusTexto: 'Operação Normal',
            situacao: 'NORMAL',
            detalhe: null,
            fonte: 'artesp',
          },
        ],
      },
    },
  ],
  geometria: { fonte: 'osrm' },
  atribuicoes: ATRIBUICOES,
};

const aguardar = {
  briefingId: 'c2d4e6f8-1a3b-4c5d-8e7f-9a0b1c2d3e4f',
  geradoEm: '2026-10-10T08:08:00-03:00',
  veredito: 'AGUARDAR',
  motivos: [
    {
      dimensao: 'weather',
      severidade: 'AGUARDAR',
      regra: 'RN01',
      texto: 'Chuva forte prevista às 09:00 (9,1 mm/h)',
    },
    {
      dimensao: 'flood',
      severidade: 'AGUARDAR',
      regra: 'RN03',
      texto:
        'Ponto histórico de alagamento a 120 m do trajeto, com chuva acima de 2,5 mm/h prevista',
    },
  ],
  janelaMeteorologica: { inicio: '2026-10-10T11:00:00-03:00', fim: '2026-10-10T12:00:00-03:00' },
  confianca: { nivel: 'MEDIA', explicacao: 'Status dos trilhos indisponível' },
  observacoes: [
    {
      dimension: 'weather',
      source: 'open-meteo',
      status: 'fresh',
      observedAt: '2026-10-10T08:00:00-03:00',
      fetchedAt: '2026-10-10T08:07:55-03:00',
      ttlSeconds: 900,
      value: {
        atual: {
          temperaturaC: 18.2,
          precipitacaoMm: 3.4,
          ventoKmH: 24.0,
          codigoTempo: 65,
          sensacaoC: 16.5,
          umidadePct: 95,
          uv: 0.6,
        },
        hoje: { temperaturaMaxC: 21, temperaturaMinC: 17 },
        sol: { nascer: '2026-10-10T05:48:00-03:00', por: '2026-10-10T18:12:00-03:00' },
        horas: [
          {
            hora: '2026-10-10T09:00:00-03:00',
            precipitacaoMm: 9.1,
            probabilidadePrecipitacao: 90,
            temperaturaC: 18.0,
          },
          {
            hora: '2026-10-10T10:00:00-03:00',
            precipitacaoMm: 4.2,
            probabilidadePrecipitacao: 80,
            temperaturaC: 18.4,
          },
          {
            hora: '2026-10-10T11:00:00-03:00',
            precipitacaoMm: 1.0,
            probabilidadePrecipitacao: 50,
            temperaturaC: 19.1,
          },
          // 4ª hora: habilita a tendência de 3 h (9,1 → 0,3 mm/h = diminuindo).
          {
            hora: '2026-10-10T12:00:00-03:00',
            precipitacaoMm: 0.3,
            probabilidadePrecipitacao: 30,
            temperaturaC: 19.8,
          },
        ],
      },
    },
    {
      dimension: 'air',
      source: 'open-meteo-air-quality',
      status: 'fresh',
      observedAt: '2026-10-10T08:00:00-03:00',
      fetchedAt: '2026-10-10T08:07:56-03:00',
      ttlSeconds: 3600,
      value: {
        pm25: 8.1,
        pm25Media24h: 12.4,
        indice: 34,
        escalaIndice: 'US_AQI',
        faixa: 'BOA',
        estimativaDeModelo: true,
      },
    },
    {
      dimension: 'rail',
      source: 'metro-sp',
      status: 'unavailable',
      observedAt: null,
      fetchedAt: null,
      ttlSeconds: 300,
      motivo: 'Página do Metrô respondeu HTTP 503',
      value: null,
    },
    {
      dimension: 'flood',
      source: 'geosampa',
      status: 'fresh',
      observedAt: '2026-10-10T08:08:00-03:00',
      fetchedAt: '2026-10-10T08:08:00-03:00',
      ttlSeconds: 86400,
      value: {
        raioM: 300,
        pontos: [
          { sourceId: 'fixture:alagamento:1', distanciaM: 120, ocorridoEm: null, local: null },
        ],
      },
    },
  ],
  geometria: { fonte: 'linha-reta' },
  atribuicoes: ATRIBUICOES,
};

// Formato que a API real devolve hoje (placeholder até a T27, apps/api/src/app.ts).
const placeholderApi = {
  briefingId: '0d9b8f2e-5a4c-4b3d-9e1f-7a6c5b4d3e2f',
  geradoEm: '2026-10-10T08:08:00-03:00',
  veredito: 'INDETERMINADO',
  motivos: [],
  janelaMeteorologica: null,
  confianca: { nivel: 'BAIXA', explicacao: 'Provedores ainda não implementados' },
  observacoes: [],
  geometria: { fonte: 'linha-reta' },
  atribuicoes: ATRIBUICOES,
};

export type FixtureBriefing = { nome: string; origem: string; briefing: BriefingResponse };

export const FIXTURES_BRIEFING: FixtureBriefing[] = [
  {
    nome: 'Favorável',
    origem: 'exemplo do contrato',
    briefing: BriefingResponseSchema.parse(exemploFavoravel),
  },
  {
    nome: 'Atenção',
    origem: 'fixture local (fictícia; texto da L8 real da ARTESP, 13/10)',
    briefing: BriefingResponseSchema.parse(atencao),
  },
  {
    nome: 'Aguardar',
    origem: 'fixture local (fictícia)',
    briefing: BriefingResponseSchema.parse(aguardar),
  },
  {
    nome: 'Indeterminado',
    origem: 'exemplo do contrato',
    briefing: BriefingResponseSchema.parse(exemploIndeterminado),
  },
  {
    nome: 'Placeholder da API',
    origem: 'resposta atual da API',
    briefing: BriefingResponseSchema.parse(placeholderApi),
  },
];
