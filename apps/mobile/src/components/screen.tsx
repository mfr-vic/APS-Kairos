// Tela de aba: cabeçalho de marca com CONTEXTO sempre presente + conteúdo rolável.
//   rótulo da aba (ONDE estou) · título (o quê; tocável quando abre um seletor) ·
//   subtítulo (de onde e QUANDO: "Paulista → Sé · atualizado às 08:08") · chip de conexão.
// As abas não têm Stack próprio, então o cabeçalho é desenhado aqui (sem botão de voltar);
// a área segura de cima fica com ele. `onRefresh` liga o puxar-para-atualizar ao refetch.
import { useState, type PropsWithChildren, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { alvoMinimo, bottomTabInset, maxContentWidth, spacing, useColors } from '@/theme';

import { vibrar } from '@/shared/feedback-tatil';

import { EstadoConexaoChip } from './estado-conexao-chip';
import { Icon } from './icon';
import { ThemedText } from './themed-text';
import { useToqueProtegido } from './use-toque-protegido';

type ScreenProps = PropsWithChildren<{
  title: string;
  /** Rótulo da aba em caixa alta acima do título ("TRAJETOS"). */
  rotulo?: string;
  /** Linha sob o título: de onde e de quando é o que a tela mostra. */
  subtitulo?: string;
  /** Torna o título um seletor (seta para baixo) — ex.: trocar o trajeto em destaque. */
  onPressTitulo?: () => void;
  /** Rótulo de leitura de tela do seletor do título. */
  rotuloSeletor?: string;
  /** Conteúdo extra dentro do cabeçalho de marca. */
  cabecalho?: ReactNode;
  /** Conteúdo ocupa a tela toda, sem ScrollView nem padding (ex.: mapa). */
  semRolagem?: boolean;
  /** Puxar para atualizar: refaz as consultas da tela; o indicador some quando a promessa resolve. */
  onRefresh?: () => Promise<unknown>;
}>;

/** Indicador do puxar-para-atualizar preso à promessa do refetch (reusado pelo StackScreen). */
export function useRefreshControl(onRefresh: (() => Promise<unknown>) | undefined, cor: string) {
  const [atualizando, setAtualizando] = useState(false);
  if (!onRefresh) return undefined;
  const aoPuxar = () => {
    // O puxão passou do limiar e disparou a atualização: um toque leve no mesmo instante.
    vibrar('toque');
    setAtualizando(true);
    onRefresh().finally(() => setAtualizando(false));
  };
  return (
    <RefreshControl refreshing={atualizando} onRefresh={aoPuxar} tintColor={cor} colors={[cor]} />
  );
}

export function Screen({
  title,
  rotulo,
  subtitulo,
  onPressTitulo,
  rotuloSeletor,
  cabecalho,
  semRolagem,
  onRefresh,
  children,
}: ScreenProps) {
  const c = useColors();
  const { top } = useSafeAreaInsets();
  const refreshControl = useRefreshControl(onRefresh, c.tint);
  // Seletor do título: toque protegido (abre UMA folha) + háptica de seleção.
  const seletor = useToqueProtegido(onPressTitulo, { tatil: 'selecao' });

  const titulo = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
      <ThemedText
        variant="largeTitle"
        tone="onBrand"
        accessibilityRole={onPressTitulo ? undefined : 'header'}
        numberOfLines={1}
        style={{ flexShrink: 1 }}
      >
        {title}
      </ThemedText>
      {onPressTitulo ? <Icon name="trocar" size={24} color={c.onBrand} /> : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View
        style={{
          backgroundColor: c.brand,
          paddingTop: top + spacing.lg,
          paddingBottom: spacing.lg,
          paddingHorizontal: spacing.lg,
        }}
      >
        <View
          style={{ width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', gap: spacing.md }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
            <View style={{ flex: 1, gap: spacing.xxs }}>
              {rotulo ? (
                <ThemedText variant="overline" tone="onBrandSecondary">
                  {rotulo}
                </ThemedText>
              ) : null}
              {onPressTitulo ? (
                <Pressable
                  onPress={seletor.aoTocar}
                  accessibilityRole="button"
                  accessibilityLabel={rotuloSeletor ?? title}
                  hitSlop={spacing.sm}
                  style={({ pressed }) => ({
                    alignSelf: 'flex-start',
                    minHeight: alvoMinimo - spacing.sm,
                    justifyContent: 'center',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  {titulo}
                </Pressable>
              ) : (
                titulo
              )}
              {subtitulo ? (
                <ThemedText variant="subhead" tone="onBrandSecondary" numberOfLines={2}>
                  {subtitulo}
                </ThemedText>
              ) : null}
            </View>
            <EstadoConexaoChip />
          </View>
          {cabecalho}
        </View>
      </View>
      {semRolagem ? (
        <View style={{ flex: 1 }}>{children}</View>
      ) : (
        <ScrollView
          testID="rolagem-da-aba"
          style={{ flex: 1 }}
          refreshControl={refreshControl}
          contentContainerStyle={{
            width: '100%',
            maxWidth: maxContentWidth,
            alignSelf: 'center',
            gap: spacing.xl,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.xl,
            paddingBottom: bottomTabInset + spacing.xxl,
          }}
        >
          {children}
        </ScrollView>
      )}
    </View>
  );
}
