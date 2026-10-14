// Renderiza com um QueryClient novo por teste (sem repetição, para os erros aparecerem na hora).
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

export function novoQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

export async function renderComQuery(ui: ReactElement, client = novoQueryClient()) {
  await render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return client;
}
