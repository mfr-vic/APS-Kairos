// Alertas calculados do último briefing em cache + tempo agora (aba Alertas e selo da aba).
import { useMemo } from 'react';

import { useBriefingMaisRecente } from '@/features/briefing/use-briefing';
import { useTempoAgora } from '@/features/tempo/use-tempo-agora';

import { avaliarAlertas } from './avaliar-alertas';

export function useAlertas() {
  const briefing = useBriefingMaisRecente();
  const { data: tempo } = useTempoAgora();
  const clima = tempo?.value ?? null;
  const alertas = useMemo(() => avaliarAlertas(briefing, clima), [briefing, clima]);
  return { alertas, temDados: !!briefing || !!clima };
}
