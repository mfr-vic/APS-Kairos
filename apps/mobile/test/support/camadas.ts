// Resposta de GET /v1/mapa/camadas para os testes (valores da fixture real de 13/10/2026 19:15; a chuva de
// Itaquera foi alterada para exercitar o impacto Aguardar).
import type { MapaCamadasResponse } from '@kairos/contracts';

export const CAMADAS_EXEMPLO: MapaCamadasResponse = {
  limiares: { chuvaAtencaoMmH: 2.5, chuvaAguardarMmH: 7.6, raioAlagamentoM: 300 },
  alagamento: {
    source: 'geosampa',
    status: 'fresh',
    observedAt: '2026-10-13T19:20:00-03:00',
    motivo: null,
    pontos: [{ lat: -23.819657, lon: -46.702602, sourceId: 'geosampa:alagamento:19', ocorridoEm: '2026-01-04', local: 'PA - PARELHEIROS' }],
  },
  clima: {
    source: 'open-meteo',
    status: 'fresh',
    observedAt: '2026-10-13T19:20:00-03:00',
    motivo: null,
    horaPrevista: '2026-10-13T20:00:00-03:00',
    pontos: [
      { regiao: 'Sé', lat: -23.55, lon: -46.63, temperaturaC: 20.7, chuvaProximaHoraMm: 0, probabilidadeChuva: 22, impactoChuva: 'NAO_PESA' },
      { regiao: 'Itaquera', lat: -23.54, lon: -46.46, temperaturaC: 21.6, chuvaProximaHoraMm: 8.2, probabilidadeChuva: 90, impactoChuva: 'AGUARDAR' },
    ],
  },
};
