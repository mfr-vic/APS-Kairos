// T15: verificação visual da tela do briefing com fixtures validadas (um por veredito).
// Ferramenta de desenvolvimento: o link fica na aba Sobre só em builds de desenvolvimento.
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView } from 'react-native';

import { useSnackbar } from '@/components/snackbar';
import { StackScreen } from '@/components/stack-screen';
import { ThemedText } from '@/components/themed-text';
import { BotaoCompartilhar } from '@/features/briefing/botao-compartilhar';
import { BriefingView } from '@/features/briefing/briefing-view';
import { FIXTURES_BRIEFING } from '@/features/briefing/fixtures';
import { radius, spacing, useColors } from '@/theme';

export default function ExemplosBriefingScreen() {
  // Para capturas: ?exemplo=N escolhe a fixture, ?detalhes=1 abre as seções e ?snackbar=1 mostra o
  // snackbar de exclusão com Desfazer (rotulado como exemplo; aqui o Desfazer não faz nada).
  const params = useLocalSearchParams<{ exemplo?: string; detalhes?: string; snackbar?: string }>();
  const snackbar = useSnackbar();
  useEffect(() => {
    if (params.snackbar !== '1') return;
    snackbar.mostrar({
      mensagem: 'Exemplo: “MASP → Sé” excluído',
      acao: { rotulo: 'Desfazer', onPress: () => {} },
      duracaoMs: 60_000,
    });
  }, [params.snackbar, snackbar]);
  const [indice, setIndice] = useState(() => {
    const n = Number(params.exemplo);
    return Number.isInteger(n) && n >= 0 && n < FIXTURES_BRIEFING.length ? n : 0;
  });
  const c = useColors();
  const atual = FIXTURES_BRIEFING[indice];
  // Relógio simulado: 2 min depois da geração do exemplo, para chegadas e janelas fazerem sentido.
  const agora = Date.parse(atual.briefing.geradoEm) + 2 * 60_000;

  return (
    <StackScreen title="Exemplos de briefing">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm }}
      >
        {FIXTURES_BRIEFING.map((f, i) => {
          const marcado = i === indice;
          return (
            <Pressable
              key={f.nome}
              onPress={() => setIndice(i)}
              accessibilityRole="tab"
              accessibilityState={{ selected: marcado }}
              style={({ pressed }) => ({
                minHeight: 40,
                justifyContent: 'center',
                paddingHorizontal: spacing.lg,
                borderRadius: radius.full,
                backgroundColor: marcado ? c.tint : pressed ? c.surfacePressed : c.surfaceMuted,
              })}
            >
              <ThemedText variant="subheadStrong" tone={marcado ? 'surface' : 'text'}>
                {f.nome}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>
      <ThemedText variant="caption" tone="textSecondary">
        Origem: {atual.origem}. Relógio simulado: 2 min depois da geração do exemplo.
      </ThemedText>
      <BriefingView briefing={atual.briefing} agora={agora} expandidoInicial={params.detalhes === '1'} />
      <BotaoCompartilhar nomeTrajeto={`Exemplo ${atual.nome}`} briefing={atual.briefing} />
    </StackScreen>
  );
}
