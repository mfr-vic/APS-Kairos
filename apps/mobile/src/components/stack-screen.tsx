import { Stack } from 'expo-router';
import { type PropsWithChildren } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { maxContentWidth, spacing, useColors } from '@/theme';

import { useRefreshControl } from './screen';

type StackScreenProps = PropsWithChildren<{
  title: string;
  /** Puxar para atualizar (ver Screen). */
  onRefresh?: () => Promise<unknown>;
}>;

/**
 * Tela empilhada sobre as abas (Novo/Editar trajeto, Briefing). O título vai no cabeçalho
 * nativo do Stack (cor de marca, ver app/_layout.tsx), que também traz o botão de voltar.
 */
export function StackScreen({ title, onRefresh, children }: StackScreenProps) {
  const c = useColors();
  const refreshControl = useRefreshControl(onRefresh, c.tint);
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ title }} />
      <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            refreshControl={refreshControl}
            contentContainerStyle={{
              width: '100%',
              maxWidth: maxContentWidth,
              alignSelf: 'center',
              gap: spacing.xl,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.lg,
              paddingBottom: spacing.xxl,
            }}
          >
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
