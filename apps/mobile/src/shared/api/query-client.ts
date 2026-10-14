import { focusManager, QueryClient } from '@tanstack/react-query';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { ApiError } from './errors';
import './network';
import { IDADE_MAXIMA_PERSISTIDA_MS } from './persister';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // C.6: revalidação temporal de 60 s.
      staleTime: 60_000,
      // Precisa ser ≥ maxAge do persister, senão o briefing salvo some antes de ser gravado/restaurado.
      gcTime: IDADE_MAXIMA_PERSISTIDA_MS,
      retry: (falhas, err) => falhas < 1 && (!(err instanceof ApiError) || err.valeRepetir),
    },
  },
});

// No React Native não existe evento de foco da janela: usamos o AppState (doc do TanStack Query),
// para refazer as consultas vencidas quando o app volta ao primeiro plano (C.6).
function aoMudarEstado(status: AppStateStatus) {
  if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
}

AppState.addEventListener('change', aoMudarEstado);
