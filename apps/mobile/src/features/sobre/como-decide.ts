// "Como o Καιρός decide": as regras do veredito (RN01–RN09, B.8 da especificação) em linguagem
// simples, com a fonte de cada limiar. Mesmos números de features/briefing/limiares.ts.
import type { IconName } from '@/components/icon';
import { decimal } from '@/features/briefing/format';
import {
  ATRASO_TRANSITO_MIN,
  CHUVA_FORTE_MM,
  CHUVA_MODERADA_MM,
  ONIBUS_DEMORANDO_MIN,
  PM25_RUIM,
} from '@/features/briefing/limiares';
import type { Tom } from '@/theme';

export type RegraExplicada = { id: string; icone: IconName; tom: Tom; titulo: string; texto: string };

export const COMO_DECIDE: RegraExplicada[] = [
  {
    id: 'RN01',
    icone: 'clima',
    tom: 'erro',
    titulo: `Chuva forte → Aguardar`,
    texto: `Mais de ${decimal(CHUVA_FORTE_MM)} mm/h agora ou nas próximas 2 h (limiar da AMS).`,
  },
  {
    id: 'RN02',
    icone: 'guardaChuva',
    tom: 'atencao',
    titulo: 'Chuva moderada → Atenção',
    texto: `Entre ${decimal(CHUVA_MODERADA_MM)} e ${decimal(CHUVA_FORTE_MM)} mm/h nas próximas 2 h (AMS).`,
  },
  {
    id: 'RN03',
    icone: 'alagamento',
    tom: 'erro',
    titulo: 'Alagamento com chuva → Aguardar',
    texto: `Ponto histórico de alagamento a até 300 m do trajeto (GeoSampa) com chuva acima de ${decimal(CHUVA_MODERADA_MM)} mm/h.`,
  },
  {
    id: 'RN05',
    icone: 'ar',
    tom: 'atencao',
    titulo: 'Ar ruim → Atenção',
    texto: `MP2,5 com média de 24 h acima de ${PM25_RUIM} µg/m³ (faixa Ruim do IQAr, CONAMA 506/2024). Estimativa de modelo (CAMS).`,
  },
  {
    id: 'RN06',
    icone: 'metro',
    tom: 'atencao',
    titulo: 'Metrô ou trem alterado → Atenção; paralisado → Aguardar',
    texto: 'Linhas 4 a 9 pela API Trilhos da ARTESP; 1, 2, 3 e 15 pela página Direto do Metrô (que também cobre a 4 e a 5 se a ARTESP falhar). Linha encerrada conta como paralisada. CPTM (10 a 13) sem fonte.',
  },
  {
    id: 'RN07',
    icone: 'onibus',
    tom: 'atencao',
    titulo: 'Ônibus demorando → Atenção',
    texto: `Próxima chegada em mais de ${ONIBUS_DEMORANDO_MIN} min, ou sem previsão (SPTrans Olho Vivo).`,
  },
  {
    id: 'RN09',
    icone: 'rota',
    tom: 'atencao',
    titulo: 'Trânsito pesado → Atenção (se você usa ônibus)',
    texto: `Atraso de ${ATRASO_TRANSITO_MIN} min ou mais, ou trânsito intenso ou parado, na rota de carro do trajeto (TomTom, ao vivo). Sem ônibus vinculado, só informa e não muda o veredito.`,
  },
  {
    id: 'RN08',
    icone: 'indeterminado',
    tom: 'neutro',
    titulo: 'Sem dados → Indeterminado',
    texto: 'Nenhuma fonte trouxe dado utilizável. A confiança cai a cada fonte desatualizada ou fora do ar.',
  },
];
