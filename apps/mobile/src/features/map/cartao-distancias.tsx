// Cartão sobre o mapa depois de "Mostrar minha posição": primeiro o mapa voa até a pessoa, depois
// entra "Você → origem" (a pé) e, em seguida, "Origem → destino" (de carro), ambos por rota calculada
// (GET /v1/rota). Sem rota: mensagem honesta e "Tentar de novo" — nunca distância em linha reta.
// Com movimento reduzido, as duas linhas aparecem juntas e sem deslocamento.
import type { RotaResponse } from '@kairos/contracts';
import { View } from 'react-native';
import Animated, { Easing, FadeInDown, ReduceMotion, useReducedMotion } from 'react-native-reanimated';

import { Botao } from '@/components/botao';
import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ACOES } from '@/shared/textos';
import { curvas, motion, radius, shadows, spacing, useColors } from '@/theme';

import { atribuicaoDaRota, textoDaRota } from './distancias';

/** O voo do Leaflet dura 1,2 s: a 1ª linha entra quando ele termina; a 2ª, logo depois. */
export const ATRASO_LINHA_1_MS = 1200;
export const ATRASO_LINHA_2_MS = ATRASO_LINHA_1_MS + 450;

export const ROTA_INDISPONIVEL = 'Rota indisponível agora; tente de novo';
export const CALCULANDO_ROTA = 'Calculando a rota…';

const entrada = (atrasoMs: number) =>
  FadeInDown.duration(motion.slow)
    .delay(atrasoMs)
    .easing(Easing.bezier(...curvas.saida))
    .withInitialValues({ opacity: 0, transform: [{ translateY: motion.entradaY }] })
    .reduceMotion(ReduceMotion.System);

/** Estado de uma rota (vem de uma query TanStack). */
export type EstadoRota = { rota: RotaResponse | undefined; carregando: boolean };

type Props = {
  /** null = sem trajeto cadastrado. */
  aPe: EstadoRota | null;
  carro: EstadoRota | null;
  nomeTrajeto: string | null;
  /** Aviso de localização aproximada (Android 12+/iOS 14+). */
  aviso: string | null;
  onTentarDeNovo: () => void;
};

function Linha({ icone, titulo, estado }: { icone: IconName; titulo: string; estado: EstadoRota }) {
  const c = useColors();
  const t = estado.rota ? textoDaRota(estado.rota) : null;
  const rotulo = t ? `${titulo}: ${t.valor}, ${t.detalhe}` : `${titulo}: ${estado.carregando ? CALCULANDO_ROTA : ROTA_INDISPONIVEL}`;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }} accessible accessibilityLabel={rotulo}>
      <Icon name={icone} size={20} color={c.tint} />
      <View style={{ flex: 1 }}>
        <ThemedText variant="caption" tone="textSecondary">
          {titulo}
        </ThemedText>
        {t ? (
          <ThemedText variant="headlineStrong">
            {t.valor} <ThemedText variant="subhead" tone="textSecondary">{t.detalhe}</ThemedText>
          </ThemedText>
        ) : (
          <ThemedText variant="subhead" tone="textSecondary">
            {estado.carregando ? CALCULANDO_ROTA : ROTA_INDISPONIVEL}
          </ThemedText>
        )}
      </View>
    </View>
  );
}

export function CartaoDistancias({ aPe, carro, nomeTrajeto, aviso, onTentarDeNovo }: Props) {
  const c = useColors();
  const reduzido = useReducedMotion();
  const estados = [aPe, carro].filter((e): e is EstadoRota => e !== null);
  const falhou = estados.some((e) => !e.rota && !e.carregando);
  const atribuicoes = [...new Set(estados.flatMap((e) => (e.rota ? [atribuicaoDaRota(e.rota)] : [])))];
  return (
    <View
      testID="cartao-distancias"
      style={{
        backgroundColor: c.surface,
        borderRadius: radius.lg,
        borderCurve: 'continuous',
        padding: spacing.md,
        gap: spacing.sm,
        boxShadow: shadows.raised,
      }}
      accessibilityLiveRegion="polite"
    >
      {aPe && carro ? (
        <>
          <Animated.View entering={reduzido ? undefined : entrada(ATRASO_LINHA_1_MS)}>
            <Linha icone="caminhar" titulo="Você → origem" estado={aPe} />
          </Animated.View>
          <Animated.View entering={reduzido ? undefined : entrada(ATRASO_LINHA_2_MS)}>
            <Linha icone="rota" titulo={`Origem → destino${nomeTrajeto ? ` · ${nomeTrajeto}` : ''}`} estado={carro} />
          </Animated.View>
          {falhou ? (
            <Botao titulo={ACOES.tentarDeNovo} icone="atualizar" variante="texto" tamanho="sm" onPress={onTentarDeNovo} />
          ) : null}
          {atribuicoes.length > 0 ? (
            <ThemedText variant="caption" tone="textSecondary">
              {atribuicoes.join(' · ')}
            </ThemedText>
          ) : null}
        </>
      ) : (
        <ThemedText variant="subhead" tone="textSecondary">
          Sua posição está marcada no mapa. Cadastre um trajeto para ver a rota até a origem.
        </ThemedText>
      )}
      {aviso ? (
        <ThemedText variant="caption" tone="fgAtencao">
          {aviso}
        </ThemedText>
      ) : null}
    </View>
  );
}
