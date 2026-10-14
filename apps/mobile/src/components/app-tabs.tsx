import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { contarParaSelo, seloDaAba } from '@/features/alertas/avaliar-alertas';
import { useAlertas } from '@/features/alertas/use-alertas';
import { feedbackTatil } from '@/shared/feedback-tatil';
import { useColors } from '@/theme';

// Abas nativas: SF Symbols no iOS (`sf`), Material Symbols no Android (`md`).
// Selo na aba Alertas = alertas calculados de nível ≥ 2 (NativeTabs.Trigger.Badge, SDK 57).
// Troca de aba: SEM animação (abas são pares, usadas 100+ vezes por dia), mas
// com háptica de seleção no toque (tabPress), o mesmo tique de um segmentado.
// Rótulos sempre visíveis no Android (labelVisibilityMode "labeled"): ícone sozinho não basta.
const OUVINTES = { tabPress: () => feedbackTatil.selecao() };

export default function AppTabs() {
  const c = useColors();
  const selo = seloDaAba(contarParaSelo(useAlertas().alertas));

  return (
    <NativeTabs
      labelVisibilityMode="labeled"
      backgroundColor={c.surface}
      indicatorColor={c.surfaceMuted}
      iconColor={{ default: c.textSecondary, selected: c.tint }}
      labelStyle={{ default: { color: c.textSecondary }, selected: { color: c.tint } }}
      badgeBackgroundColor={c.danger}
      badgeTextColor={c.onDanger}
      screenListeners={OUVINTES}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Trajetos</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="point.topleft.down.to.point.bottomright.curvepath"
          md="route"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="alertas">
        <NativeTabs.Trigger.Label>Alertas</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="exclamationmark.triangle" md="warning" />
        {/* Com texto, o expo-router ignora `hidden` e mostraria "0": o texto só vai quando > 0. */}
        <NativeTabs.Trigger.Badge hidden={selo.hidden}>{selo.texto}</NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="mapa">
        <NativeTabs.Trigger.Label>Mapa</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="map" md="map" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="sobre">
        <NativeTabs.Trigger.Label>Sobre</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="info.circle" md="info" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
