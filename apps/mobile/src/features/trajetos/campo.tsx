// Campo de texto e mensagem de erro do cadastro de trajeto (formulário, busca de endereço e de ônibus).
import { TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { radius, spacing, typography, useColors } from '@/theme';

type CampoProps = {
  rotulo: string;
  valor: string;
  placeholder?: string;
  erro?: string;
  teclado?: KeyboardTypeOptions;
  /** Ícone à esquerda dentro do campo (ex.: lupa nas buscas). */
  icone?: IconName;
  onChange: (texto: string) => void;
  onSubmit?: () => void;
};

export function Campo({
  rotulo,
  valor,
  placeholder,
  erro,
  teclado,
  icone,
  onChange,
  onSubmit,
}: CampoProps) {
  const c = useColors();
  return (
    <View style={{ gap: spacing.xs }}>
      <ThemedText variant="caption" tone="textSecondary">
        {rotulo}
      </ThemedText>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          minHeight: 48,
          paddingHorizontal: spacing.md,
          borderRadius: radius.md,
          borderCurve: 'continuous',
          backgroundColor: c.surfaceMuted,
          // Erro: contorno vermelho + mensagem (nunca só a cor).
          borderWidth: 2,
          borderColor: erro ? c.danger : 'transparent',
        }}
      >
        {icone ? <Icon name={icone} size={20} color={c.textSecondary} /> : null}
        <TextInput
          value={valor}
          onChangeText={onChange}
          onSubmitEditing={onSubmit}
          returnKeyType={onSubmit ? 'search' : undefined}
          placeholder={placeholder}
          placeholderTextColor={c.textSecondary}
          keyboardType={teclado}
          autoCapitalize={teclado === 'url' ? 'none' : undefined}
          autoCorrect={teclado === 'url' ? false : undefined}
          accessibilityLabel={rotulo}
          style={[typography.body, { flex: 1, color: c.text, paddingVertical: spacing.sm }]}
        />
      </View>
      {erro ? <Erro texto={erro} /> : null}
    </View>
  );
}

export function Erro({ texto }: { texto: string }) {
  return (
    <ThemedText variant="subhead" tone="danger" accessibilityRole="alert">
      {texto}
    </ThemedText>
  );
}
