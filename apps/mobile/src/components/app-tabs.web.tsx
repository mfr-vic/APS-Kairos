// Abas na web (desenvolvimento e capturas): barra inferior simples com ícone + rótulo.
import type { Href } from 'expo-router';
import {
  TabList,
  TabListProps,
  Tabs,
  TabSlot,
  TabTrigger,
  TabTriggerSlotProps,
} from 'expo-router/ui';
import { Pressable, StyleSheet, View } from 'react-native';

import { contarParaSelo } from '@/features/alertas/avaliar-alertas';
import { useAlertas } from '@/features/alertas/use-alertas';
import { radius, spacing, useColors } from '@/theme';

import { Icon, type IconName } from './icon';
import { ThemedText } from './themed-text';

// As abas moram no grupo (tabs); os tipos gerados só listam "/(tabs)/index", mas "/" é a URL real.
const RAIZ = '/' as Href;

export default function AppTabs() {
  const selo = contarParaSelo(useAlertas().alertas);
  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
      <TabList asChild>
        <BarraAbas>
          <TabTrigger name="index" href={RAIZ} asChild>
            <BotaoAba icone="rota">Trajetos</BotaoAba>
          </TabTrigger>
          <TabTrigger name="alertas" href="/alertas" asChild>
            <BotaoAba icone="atencao" selo={selo}>
              Alertas
            </BotaoAba>
          </TabTrigger>
          <TabTrigger name="mapa" href="/mapa" asChild>
            <BotaoAba icone="mapa">Mapa</BotaoAba>
          </TabTrigger>
          <TabTrigger name="sobre" href="/sobre" asChild>
            <BotaoAba icone="info">Sobre</BotaoAba>
          </TabTrigger>
        </BarraAbas>
      </TabList>
    </Tabs>
  );
}

function BotaoAba({
  children,
  isFocused,
  icone,
  selo = 0,
  ...props
}: TabTriggerSlotProps & { icone: IconName; selo?: number }) {
  const c = useColors();
  const cor = isFocused ? c.tint : c.textSecondary;
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityState={{ selected: !!isFocused }}
      accessibilityLabel={selo > 0 ? `${children}, ${selo} alertas` : undefined}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        gap: spacing.xxs,
        paddingVertical: spacing.sm,
        backgroundColor: pressed ? c.surfacePressed : 'transparent',
      })}
    >
      <View>
        <Icon name={icone} size={24} color={cor} />
        {selo > 0 ? (
          <View
            style={{
              position: 'absolute',
              top: -spacing.xs,
              right: -spacing.md,
              minWidth: 18,
              height: 18,
              paddingHorizontal: spacing.xs,
              borderRadius: radius.full,
              backgroundColor: c.danger,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ThemedText variant="caption" tone="onDanger">
              {selo}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <ThemedText variant="caption" style={{ color: cor }}>
        {children}
      </ThemedText>
    </Pressable>
  );
}

function BarraAbas(props: TabListProps) {
  const c = useColors();
  return (
    <View
      {...props}
      style={{
        flexDirection: 'row',
        backgroundColor: c.surface,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: c.separator,
      }}
    />
  );
}
