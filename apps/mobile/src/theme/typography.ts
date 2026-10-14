import { Platform, type TextStyle } from 'react-native';

// Space Grotesk (carregada em app/_layout.tsx com useFonts). Peso SEMPRE via fontFamily
// (arquivo estático por peso), nunca fontWeight sintético. Tamanhos crescem com a fonte
// do aparelho (allowFontScaling padrão).
// Na web, fallback sans-serif explícito: a Space Grotesk não tem glifos gregos ("Καιρός")
// e sem fallback o navegador cai na serifada padrão. No nativo o sistema resolve sozinho.
const fam = (nome: string) =>
  Platform.select({ web: `${nome}, system-ui, sans-serif`, default: nome })!;

export const fonts = {
  regular: fam('SpaceGrotesk_400Regular'),
  medium: fam('SpaceGrotesk_500Medium'),
  bold: fam('SpaceGrotesk_700Bold'),
} as const;

const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

export const typography = {
  largeTitle: { fontSize: 28, lineHeight: 32, fontFamily: fonts.bold },
  title: { fontSize: 22, lineHeight: 26, fontFamily: fonts.bold },
  /** Título de seção das telas ("O que fazer agora", "Tempo agora"). */
  sectionTitle: { fontSize: 19, lineHeight: 24, fontFamily: fonts.bold },
  headline: { fontSize: 17, lineHeight: 22, fontFamily: fonts.medium },
  headlineStrong: { fontSize: 17, lineHeight: 22, fontFamily: fonts.bold },
  body: { fontSize: 16, lineHeight: 22, fontFamily: fonts.regular },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontFamily: fonts.medium },
  subhead: { fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  subheadStrong: { fontSize: 14, lineHeight: 20, fontFamily: fonts.medium },
  caption: { fontSize: 12, lineHeight: 16, fontFamily: fonts.medium },
  /** Seção de lista agrupada ("MEUS TRAJETOS"). */
  overline: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  /** Veredito no topo do briefing (palavra grande). */
  display: { fontSize: 42, lineHeight: 46, fontFamily: fonts.bold, ...TABULAR },
  /** Número grande de painel ("23 °C", "13 min"). */
  metricLg: { fontSize: 40, lineHeight: 44, fontFamily: fonts.bold, ...TABULAR },
  /** Número médio em linha de lista ("4 min"). */
  metric: { fontSize: 20, lineHeight: 24, fontFamily: fonts.bold, ...TABULAR },
  code: { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, ...TABULAR },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;
