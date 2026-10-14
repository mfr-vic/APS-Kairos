// O "porquê" de cada seção do briefing: como aquela dimensão pesou no veredito (função pura).
// Com motivo da API para a dimensão, usa o texto dele (é a regra que de fato disparou);
// sem motivo, diz qual limite foi respeitado.
import type { BriefingResponse, Observation } from '@kairos/contracts';

import type { Tom } from '@/theme';

import { DIMENSAO_NA_FRASE, explicarMotivo } from './explicar-fonte';
import { decimal } from './format';
import { ATRASO_TRANSITO_MIN, CHUVA_MODERADA_MM, ONIBUS_DEMORANDO_MIN, PM25_RUIM } from './limiares';

const TOM_SEVERIDADE = { AGUARDAR: 'erro', ATENCAO: 'atencao', INFORMATIVO: 'neutro' } as const;
const PESO = { AGUARDAR: 0, ATENCAO: 1, INFORMATIVO: 2 } as const;

export function efeitoDaDimensao(obs: Observation, b: BriefingResponse): { tom: Tom; texto: string } {
  if (obs.status === 'unavailable' || obs.value === null) {
    return {
      tom: 'neutro',
      texto: `Fora do veredito: ${explicarMotivo(obs.source, obs.motivo)}.`,
    };
  }
  const motivo = b.motivos
    .filter((m) => m.dimensao === obs.dimension)
    .sort((x, y) => PESO[x.severidade] - PESO[y.severidade])[0];
  if (motivo) {
    const peso = motivo.severidade === 'INFORMATIVO' ? 'Não muda o veredito' : 'Pesa no veredito';
    return { tom: TOM_SEVERIDADE[motivo.severidade], texto: `${peso}: ${motivo.texto}.` };
  }
  switch (obs.dimension) {
    case 'bus':
      return { tom: 'ok', texto: `Chegada em até ${ONIBUS_DEMORANDO_MIN} min: não pesa no veredito.` };
    case 'rail':
      return { tom: 'ok', texto: 'Operação sem alteração: não pesa no veredito.' };
    case 'weather':
      return {
        tom: 'ok',
        texto: `Chuva até ${decimal(CHUVA_MODERADA_MM)} mm/h nas próximas 2 h: não pesa no veredito.`,
      };
    case 'air':
      return obs.value.pm25Media24h === null
        ? { tom: 'neutro', texto: `Sem média de 24 h: ${DIMENSAO_NA_FRASE.air} não entra no veredito.` }
        : { tom: 'ok', texto: `Média de 24 h até ${PM25_RUIM} µg/m³: não pesa no veredito.` };
    case 'flood':
      return { tom: 'ok', texto: `Nenhum ponto a até ${obs.value.raioM} m: não pesa no veredito.` };
    case 'traffic':
      return {
        tom: 'ok',
        texto: `Atraso abaixo de ${ATRASO_TRANSITO_MIN} min e sem trânsito intenso: não pesa no veredito.`,
      };
  }
}
