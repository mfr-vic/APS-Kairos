// RF17 / TC19 / TC20: o último briefing de cada trajeto sobrevive a reinício e a falta de rede.
// O cache do TanStack Query é gravado no AsyncStorage e restaurado ao abrir o app.
import { CONTRACT_VERSION } from '@kairos/contracts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { PersistQueryClientProviderProps } from '@tanstack/react-query-persist-client';

import { CHAVE_BRIEFING, CHAVE_LINHAS_TRILHO } from './query-keys';

/** Por quanto tempo um briefing salvo ainda é mostrado offline (com aviso de desatualização). */
export const IDADE_MAXIMA_PERSISTIDA_MS = 7 * 24 * 60 * 60 * 1000;

export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'kairos:query-cache:v1',
  throttleTime: 1000,
});

export const opcoesPersistencia: PersistQueryClientProviderProps['persistOptions'] = {
  persister,
  maxAge: IDADE_MAXIMA_PERSISTIDA_MS,
  // Mudou o contrato → descarta o cache antigo em vez de mostrar dado com formato velho.
  buster: CONTRACT_VERSION,
  dehydrateOptions: {
    // Só briefings e a lista de linhas de trilho (fallback do RailPicker, RF03) bem-sucedidos.
    // Estado dos provedores e erros não fazem sentido offline; os trajetos já moram no AsyncStorage.
    shouldDehydrateQuery: (query) =>
      (query.queryKey[0] === CHAVE_BRIEFING || query.queryKey[0] === CHAVE_LINHAS_TRILHO) &&
      query.state.status === 'success',
  },
};
