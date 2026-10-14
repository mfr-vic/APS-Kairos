// RF03 / TC04: seleção das linhas de trilho vinculadas ao trajeto. A lista vem de
// GET /v1/transit/rail/lines (só linhas com fonte); sem API, usa o cache persistido ou a lista local.
import type { RailLine } from '@kairos/contracts';
import { useQuery } from '@tanstack/react-query';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { LineBadge } from '@/components/line-badge';
import { ThemedText } from '@/components/themed-text';
import { api } from '@/shared/api/client';
import { mensagemDeErro } from '@/shared/api/errors';
import { queryKeys } from '@/shared/api/query-keys';
import { radius, spacing, useColors } from '@/theme';

import { LINHAS_TRILHO_LOCAL, rotuloLinhaTrilho } from './linhas-trilho';

type Props = {
  selecionadas: RailLine[];
  onChange: (linhas: RailLine[]) => void;
};

export function RailPicker({ selecionadas, onChange }: Props) {
  const c = useColors();
  const consulta = useQuery({
    queryKey: queryKeys.linhasTrilho,
    queryFn: ({ signal }) => api.linhasTrilho(signal),
    staleTime: 24 * 60 * 60 * 1000,
  });
  const semApi = consulta.isError || consulta.fetchStatus === 'paused';
  const motivo = consulta.isError ? mensagemDeErro(consulta.error) : 'Sem conexão.';

  function alternar(linha: RailLine) {
    onChange(
      selecionadas.includes(linha)
        ? selecionadas.filter((l) => l !== linha)
        : [...selecionadas, linha]
    );
  }

  if (consulta.isPending && !semApi) {
    return (
      <ThemedText variant="subhead" tone="textSecondary">
        Carregando linhas…
      </ThemedText>
    );
  }
  const opcoes = consulta.data?.linhas ?? LINHAS_TRILHO_LOCAL;

  return (
    <View style={{ gap: spacing.sm }}>
      {semApi ? (
        <ThemedText variant="subhead" tone="textSecondary" accessibilityRole="alert">
          {motivo}{' '}
          {consulta.data
            ? 'Mostrando a última lista de linhas obtida da API.'
            : 'Mostrando a lista local de linhas, que pode estar desatualizada.'}
        </ThemedText>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {opcoes.map((op) => {
          const { linha, nome, operadora } = op;
          const rotulo = rotuloLinhaTrilho(op);
          const marcada = selecionadas.includes(linha);
          return (
            <Pressable
              key={linha}
              onPress={() => alternar(linha)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: marcada }}
              accessibilityLabel={rotulo}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                minHeight: 48,
                paddingLeft: spacing.sm,
                paddingRight: spacing.md,
                borderRadius: radius.full,
                borderWidth: 2,
                borderColor: marcada ? c.tint : 'transparent',
                backgroundColor: pressed ? c.surfacePressed : marcada ? c.surface : c.surfaceMuted,
              })}
            >
              <LineBadge tipo="trilho" linha={linha} />
              <View>
                <ThemedText variant="subheadStrong">{nome}</ThemedText>
                <ThemedText variant="caption" tone="textSecondary">
                  {operadora}
                </ThemedText>
              </View>
              {marcada ? <Icon name="marcado" size={20} color={c.tint} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
