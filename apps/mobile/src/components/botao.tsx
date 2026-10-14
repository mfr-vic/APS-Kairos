// Botão do design system (padrões do shadcn/ui — variante × tamanho, estados desabilitado /
// processando / pressionado, foco acessível — dentro do nosso tema, sem segundo sistema de
// estilo). Retorno no press-in: escala 0,97 + fundo mais escuro em 120 ms (transição CSS do
// Reanimated, sem worklet). Com movimento reduzido, só o fundo muda (sem escala).
// Toque protegido (useToqueProtegido): ignora repetições, mostra "processando" enquanto a
// ação assíncrona roda e vibra uma vez por ação (leve; seleção nos botões de texto).
import { useState } from 'react';
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import type { TipoTatil } from '@/shared/feedback-tatil';
import {
  alvoMinimo,
  curvasCss,
  motion,
  radius,
  spacing,
  statusColors,
  useColors,
  type Palette,
} from '@/theme';

import { Icon, type IconName } from './icon';
import { ThemedText } from './themed-text';
import { useToqueProtegido, type AcaoDeToque } from './use-toque-protegido';

type Variante = 'primario' | 'secundario' | 'perigo' | 'texto';

type BotaoProps = {
  titulo: string;
  /** Pode devolver uma promessa: até ela terminar o botão fica "processando". */
  onPress: AcaoDeToque;
  /** primario = chamada principal da tela; secundario = ação comum; texto = link. */
  variante?: Variante;
  tamanho?: 'sm' | 'md';
  icone?: IconName;
  desabilitado?: boolean;
  /** Indicador no lugar do ícone; o título continua visível. */
  carregando?: boolean;
  /** Háptica do toque. Padrão: 'toque' (leve); botões de texto: 'selecao'. false = nenhuma. */
  tatil?: TipoTatil | false;
  /** Texto do aviso se a ação demorar (padrão "Processando…"). */
  avisoProcessando?: string;
  /** Rótulo de leitura de tela mais completo que o título visível (deve contê-lo). */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

function cores(v: Variante, c: Palette): { fundo: string; pressionado: string; texto: keyof Palette } {
  switch (v) {
    case 'primario':
      return { fundo: c.accent, pressionado: c.surfacePressed, texto: 'onAccent' };
    case 'secundario':
      return { fundo: c.surfaceMuted, pressionado: c.surfacePressed, texto: 'tint' };
    case 'perigo':
      return { fundo: statusColors.aguardar, pressionado: statusColors.aguardar, texto: 'onBrand' };
    case 'texto':
      return { fundo: 'transparent', pressionado: c.surfacePressed, texto: 'tint' };
  }
}

export function Botao({
  titulo,
  onPress,
  variante = 'secundario',
  tamanho = 'md',
  icone,
  desabilitado = false,
  carregando = false,
  tatil,
  avisoProcessando,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: BotaoProps) {
  const c = useColors();
  const reduzido = useReducedMotion();
  const [pressionado, setPressionado] = useState(false);
  const { aoTocar, processando } = useToqueProtegido(onPress, {
    tatil: tatil ?? (variante === 'texto' ? 'selecao' : 'toque'),
    aviso: avisoProcessando,
  });
  const { fundo, pressionado: fundoPressionado, texto } = cores(variante, c);
  const ocupado = carregando || processando;
  // "processando" não desabilita: o toque repetido precisa chegar para avisar a pessoa.
  const inativo = desabilitado || carregando;
  const escala = pressionado && !reduzido && variante !== 'texto' ? motion.escalaBotao : 1;
  return (
    <Pressable
      testID={testID}
      onPress={aoTocar}
      onPressIn={() => setPressionado(true)}
      onPressOut={() => setPressionado(false)}
      disabled={inativo}
      hitSlop={tamanho === 'sm' ? spacing.xs : undefined}
      pressRetentionOffset={spacing.lg}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? titulo}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inativo, busy: ocupado }}
      style={style}
    >
      <Animated.View
        testID={testID ? `${testID}-superficie` : 'botao-superficie'}
        style={{
          minHeight: tamanho === 'md' ? alvoMinimo : 40,
          paddingHorizontal: variante === 'texto' ? spacing.sm : spacing.lg,
          borderRadius: radius.md,
          borderCurve: 'continuous',
          backgroundColor: pressionado ? fundoPressionado : fundo,
          justifyContent: 'center',
          opacity: desabilitado ? 0.45 : pressionado && variante === 'perigo' ? 0.85 : 1,
          transform: [{ scale: escala }],
          transitionProperty: reduzido ? ['backgroundColor'] : ['transform', 'backgroundColor', 'opacity'],
          transitionDuration: motion.toque,
          transitionTimingFunction: curvasCss.saida,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: variante === 'texto' ? 'flex-start' : 'center',
            gap: spacing.sm,
          }}
        >
          {ocupado ? (
            <ActivityIndicator testID="botao-processando" size="small" color={c[texto]} />
          ) : icone ? (
            <Icon name={icone} size={20} color={c[texto]} />
          ) : null}
          <ThemedText variant={tamanho === 'md' ? 'bodyStrong' : 'subheadStrong'} tone={texto}>
            {titulo}
          </ThemedText>
        </View>
      </Animated.View>
    </Pressable>
  );
}
