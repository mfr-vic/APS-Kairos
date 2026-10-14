import { Platform } from 'react-native';

// Escala de 4 pt. Linha < grupo < seção: use passos diferentes para cada nível.
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Largura máxima do conteúdo (web/tablet). */
export const maxContentWidth = 720;

/** Espaço sob o conteúdo das abas para não ficar atrás da barra nativa (valor do template). */
export const bottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;

/** Altura ocupada pela barra de abas (nativa ou a da web), para o snackbar não ficar atrás dela. */
export const alturaBarraAbas = Platform.select({ ios: 50, android: 80, default: 64 }) ?? 64;

/** Alvo mínimo de toque (Android 48 dp; iOS 44 pt). */
export const alvoMinimo = 48;
