import { Text, type TextProps } from 'react-native';

import { typography, useColors, type Palette, type TypographyVariant } from '@/theme';

export type ThemedTextProps = TextProps & {
  variant?: TypographyVariant;
  /** Cor da paleta; padrão `text`. */
  tone?: keyof Palette;
};

export function ThemedText({ variant = 'body', tone = 'text', style, ...rest }: ThemedTextProps) {
  const c = useColors();
  return <Text style={[typography[variant], { color: c[tone] }, style]} {...rest} />;
}
