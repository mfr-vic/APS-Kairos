// Snackbar do Καιρός: confirmação perceptível de toda ação da pessoa (salvar, tornar principal,
// excluir, trocar tema, compartilhar), com "Desfazer" quando a ação é reversível.
// - Um por vez: o novo substitui o anterior (o anterior já foi lido ou perdeu a vez).
// - Some sozinho: 3 s sem ação, 5 s com Desfazer; o dobro com leitor de tela ativo (WCAG 2.2.1).
// - Acessível: região viva "polite" + anúncio explícito com a ação disponível.
// - Movimento: entra subindo com mola sem quique (~300 ms percebidos, molas.entrada) e sai
//   descendo 200 ms (ease-out, ~20 % mais rápido que a entrada); nada com movimento reduzido.
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeOutDown,
  ReduceMotion,
  useReducedMotion,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  alvoMinimo,
  curvas,
  maxContentWidth,
  molas,
  motion,
  radius,
  shadows,
  spacing,
  useColors,
} from '@/theme';

import { Icon, type IconName } from './icon';
import { ThemedText } from './themed-text';

export const DURACAO_SNACKBAR_MS = 3000;
export const DURACAO_COM_DESFAZER_MS = 5000;

export type OpcoesSnackbar = {
  mensagem: string;
  /** Ação única (ex.: Desfazer, Ver briefing). Ao tocar, o snackbar some. */
  acao?: { rotulo: string; onPress: () => void };
  /** sucesso (padrão) mostra ✓; erro mostra o ícone de atenção. */
  tipo?: 'sucesso' | 'erro' | 'info';
  duracaoMs?: number;
};

type Atual = OpcoesSnackbar & { id: number; duracaoMs: number };

type ApiSnackbar = { mostrar: (opcoes: OpcoesSnackbar) => void; ocultar: () => void };

const Contexto = createContext<ApiSnackbar | null>(null);
const SEM_PROVIDER: ApiSnackbar = { mostrar: () => {}, ocultar: () => {} };

/** Fora do provider (testes de componente isolado) vira no-op. */
export function useSnackbar(): ApiSnackbar {
  return use(Contexto) ?? SEM_PROVIDER;
}

const EASE_OUT = Easing.bezier(...curvas.saida);
const ENTRA = FadeInDown.springify()
  .duration(molas.entrada.duration)
  .dampingRatio(molas.entrada.dampingRatio)
  .reduceMotion(ReduceMotion.System);
const SAI = FadeOutDown.duration(motion.base).easing(EASE_OUT).reduceMotion(ReduceMotion.System);

const ICONE: Record<NonNullable<OpcoesSnackbar['tipo']>, IconName> = {
  sucesso: 'favoravel',
  erro: 'atencao',
  info: 'info',
};

type ProviderProps = PropsWithChildren<{
  /** Espaço extra embaixo (altura da barra de abas quando a tela atual é uma aba). */
  margemInferior?: number;
}>;

export function SnackbarProvider({ children, margemInferior = 0 }: ProviderProps) {
  const [atual, setAtual] = useState<Atual | null>(null);
  const [leitorAtivo, setLeitorAtivo] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    let ativo = true;
    AccessibilityInfo.isScreenReaderEnabled?.().then(
      (v) => ativo && setLeitorAtivo(v),
      () => {}
    );
    const sub = AccessibilityInfo.addEventListener?.('screenReaderChanged', setLeitorAtivo);
    return () => {
      ativo = false;
      sub?.remove();
    };
  }, []);

  const limparTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const ocultar = useCallback(() => {
    limparTimer();
    setAtual(null);
  }, []);

  const mostrar = useCallback(
    (opcoes: OpcoesSnackbar) => {
      limparTimer();
      const base = opcoes.duracaoMs ?? (opcoes.acao ? DURACAO_COM_DESFAZER_MS : DURACAO_SNACKBAR_MS);
      const duracaoMs = leitorAtivo ? base * 2 : base;
      const id = ++seq.current;
      setAtual({ ...opcoes, id, duracaoMs });
      AccessibilityInfo.announceForAccessibility?.(
        opcoes.acao ? `${opcoes.mensagem}. Ação disponível: ${opcoes.acao.rotulo}.` : opcoes.mensagem
      );
      timer.current = setTimeout(() => {
        setAtual((a) => (a?.id === id ? null : a));
      }, duracaoMs);
    },
    [leitorAtivo]
  );

  useEffect(() => limparTimer, []);

  const api = useMemo(() => ({ mostrar, ocultar }), [mostrar, ocultar]);

  return (
    <Contexto value={api}>
      {children}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: 'center',
        }}
      >
        {atual ? (
          <BarraSnackbar key={atual.id} snack={atual} margemInferior={margemInferior} onFechar={ocultar} />
        ) : null}
      </View>
    </Contexto>
  );
}

function BarraSnackbar({
  snack,
  margemInferior,
  onFechar,
}: {
  snack: Atual;
  margemInferior: number;
  onFechar: () => void;
}) {
  const c = useColors();
  const reduzido = useReducedMotion();
  const { bottom } = useSafeAreaInsets();
  const tipo = snack.tipo ?? 'sucesso';

  return (
    <Animated.View
      testID="snackbar"
      entering={reduzido ? undefined : ENTRA}
      exiting={reduzido ? undefined : SAI}
      accessibilityLiveRegion="polite"
      style={{
        width: '100%',
        maxWidth: maxContentWidth,
        paddingHorizontal: spacing.lg,
        paddingBottom: bottom + margemInferior + spacing.md,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          minHeight: alvoMinimo + spacing.sm,
          paddingLeft: spacing.lg,
          paddingRight: snack.acao ? spacing.xs : spacing.lg,
          paddingVertical: spacing.xs,
          borderRadius: radius.lg,
          borderCurve: 'continuous',
          backgroundColor: c.inverseSurface,
          boxShadow: shadows.raised,
        }}
      >
        <Icon name={ICONE[tipo]} size={20} color={c.inverseAction} />
        <ThemedText
          variant="subheadStrong"
          tone="onInverse"
          style={{ flex: 1, paddingVertical: spacing.sm }}
          accessibilityRole={tipo === 'erro' ? 'alert' : undefined}
        >
          {snack.mensagem}
        </ThemedText>
        {snack.acao ? (
          <Pressable
            onPress={() => {
              snack.acao!.onPress();
              onFechar();
            }}
            accessibilityRole="button"
            accessibilityLabel={snack.acao.rotulo}
            hitSlop={spacing.xs}
            style={({ pressed }) => ({
              minHeight: alvoMinimo,
              minWidth: alvoMinimo,
              paddingHorizontal: spacing.md,
              justifyContent: 'center',
              borderRadius: radius.md,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <ThemedText variant="bodyStrong" tone="inverseAction">
              {snack.acao.rotulo}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}
