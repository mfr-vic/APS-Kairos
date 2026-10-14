// useAlertas: combina o briefing mais recente em cache com o tempo agora; temDados sem nada = false.
import { QueryClient } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { useAlertas } from '@/features/alertas/use-alertas';
import { FIXTURES_BRIEFING } from '@/features/briefing/fixtures';
import { api } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';

import { novoQueryClient } from '../../support/render-com-query';

jest.mock('@/features/trajetos/obter-localizacao', () => ({
  obterLocalizacaoSePermitida: jest.fn().mockResolvedValue(null),
}));

const wrapper = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };

describe('useAlertas', () => {
  it('sem briefing e com o tempo indisponível → sem dados', async () => {
    jest.spyOn(api, 'tempoAgora').mockRejectedValue(new Error('rede'));
    const { result } = await renderHook(() => useAlertas(), { wrapper: wrapper(novoQueryClient()) });
    await waitFor(() => expect(result.current.temDados).toBe(false));
    expect(result.current.alertas).toEqual([]);
  });

  it('briefing AGUARDAR em cache → alertas calculados sem chamar a API de briefing', async () => {
    jest.spyOn(api, 'tempoAgora').mockRejectedValue(new Error('rede'));
    const client = novoQueryClient();
    const aguardar = FIXTURES_BRIEFING.find((f) => f.briefing.veredito === 'AGUARDAR')!.briefing;
    client.setQueryData(queryKeys.briefing('t1', 'v1'), aguardar);
    const { result } = await renderHook(() => useAlertas(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.alertas.length).toBe(2));
    expect(result.current.temDados).toBe(true);
    expect(result.current.alertas[0].titulo).toBe('Chuva forte');
  });
});
