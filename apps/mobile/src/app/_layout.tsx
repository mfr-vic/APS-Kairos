import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
  useFonts,
} from '@expo-google-fonts/space-grotesk';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';

import { SnackbarProvider } from '@/components/snackbar';
import { carregarServidorApi } from '@/features/provedores/servidor-api';
import { LembretesDeSaida } from '@/features/notificacoes/lembretes-de-saida';
import { opcoesPersistencia } from '@/shared/api/persister';
import { queryClient } from '@/shared/api/query-client';
import { opcoesFolha, opcoesPilha } from '@/shared/navegacao/apresentacao';
import { alturaBarraAbas, fonts, TemaProvider, useColors, useEsquema } from '@/theme';

// Folhas (seletor de trajeto, ações): formSheet nativa só no iOS; no Android, tela modal com
// cabeçalho — a formSheet do Android congelava o app (ver shared/navegacao/apresentacao.ts).

// Splash fica na tela até a Space Grotesk carregar (evita troca de fonte visível).
SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Stack raiz envolvendo as abas nativas (grupo `(tabs)`): Novo/Editar trajeto, Briefing e
 * Provedores são empilhados por cima das abas e o "voltar" retorna à lista (padrão "stacks
 * inside tabs" da doc do Expo Router; as NativeTabs carregam todas as abas ao montar).
 */
export default function RootLayout() {
  const [fontesProntas] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });

  // Endereço da API salvo no aparelho lido antes de qualquer consulta (nada vai ao padrão do build por engano).
  const [servidorPronto, setServidorPronto] = useState(false);
  useEffect(() => {
    carregarServidorApi().finally(() => setServidorPronto(true));
  }, []);

  const pronto = fontesProntas && servidorPronto;
  useEffect(() => {
    if (pronto) SplashScreen.hideAsync().catch(() => {});
  }, [pronto]);

  if (!pronto) return null;

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={opcoesPersistencia}>
      <TemaProvider>
        <AppRaiz />
      </TemaProvider>
    </PersistQueryClientProvider>
  );
}

function AppRaiz() {
  const escuro = useEsquema() === 'dark';
  const c = useColors();
  const reduzido = useReducedMotion();
  // Snackbar acima da barra de abas quando a tela atual é uma aba; rente ao fundo nas pilhas.
  const segmentos = useSegments();
  const naAba = segmentos[0] === '(tabs)';
  const base = escuro ? DarkTheme : DefaultTheme;
  const tema = {
    ...base,
    colors: {
      ...base.colors,
      primary: c.tint,
      background: c.background,
      card: c.surface,
      text: c.text,
      border: c.separator,
    },
  };

  return (
    <ThemeProvider value={tema}>
      {/* Cabeçalhos são sempre verde-estrutura: ícones claros na barra de status nos 2 temas. */}
      <StatusBar style="light" />
      <SnackbarProvider margemInferior={naAba ? alturaBarraAbas : 0}>
        <Stack
          screenOptions={{
            headerBackTitle: 'Voltar',
            headerStyle: { backgroundColor: c.brand },
            headerTintColor: c.onBrand,
            headerTitleStyle: { color: c.onBrand, fontFamily: fonts.medium },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: c.background },
            ...opcoesPilha(Platform.OS, reduzido),
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          {/* `dangerouslySingular`: a pilha nunca guarda 2 instâncias da mesma rota com os mesmos
              parâmetros — um 2º push da tela do topo não empilha nada (item 8, 13/10). */}
          <Stack.Screen name="trajetos/novo" dangerouslySingular options={{ title: 'Novo trajeto' }} />
          <Stack.Screen
            name="trajetos/[id]/editar"
            dangerouslySingular
            options={{ title: 'Editar trajeto' }}
          />
          <Stack.Screen
            name="trajetos/[id]/briefing"
            dangerouslySingular
            options={{ title: 'Briefing' }}
          />
          <Stack.Screen
            name="trajetos/[id]/itinerario/[linha]"
            dangerouslySingular
            options={{ title: 'Itinerário' }}
          />
          <Stack.Screen
            name="trajetos/[id]/acoes"
            dangerouslySingular
            options={opcoesFolha(Platform.OS, 'Ações do trajeto', reduzido)}
          />
          <Stack.Screen
            name="seletor-trajeto"
            dangerouslySingular
            options={opcoesFolha(Platform.OS, 'Trajeto em destaque', reduzido)}
          />
          <Stack.Screen name="provedores" dangerouslySingular options={{ title: 'Estado das fontes' }} />
          <Stack.Screen
            name="registro-requisicoes"
            dangerouslySingular
            options={{ title: 'Registro de requisições' }}
          />
          <Stack.Screen
            name="como-funciona"
            dangerouslySingular
            options={{ title: 'Como o Καιρός funciona' }}
          />
          <Stack.Screen name="relatorio" dangerouslySingular options={{ title: 'Relatório do sistema' }} />
          <Stack.Screen
            name="exemplos-briefing"
            dangerouslySingular
            options={{ title: 'Exemplos de briefing' }}
          />
        </Stack>
        {/* RF25: toque no lembrete abre o briefing; agendamentos seguem trajetos e preferências. */}
        <LembretesDeSaida />
      </SnackbarProvider>
    </ThemeProvider>
  );
}
