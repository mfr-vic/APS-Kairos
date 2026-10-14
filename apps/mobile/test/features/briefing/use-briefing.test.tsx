// T29 / RF05: o briefing é pedido com o trajeto salvo (ônibus e trilhos) num BriefingRequest válido.
import { BriefingRequestSchema, type BriefingRequest } from '@kairos/contracts';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import exemploJson from '../../../../../packages/contracts/examples/briefing-request.json';

import {
  montarBriefingRequest,
  useBriefing,
  useUltimoBriefing,
} from '@/features/briefing/use-briefing';
import { criarTrajetoStore } from '@/features/trajetos/trajeto-store';
import { api } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';

import { novoQueryClient } from '../../support/render-com-query';

jest.mock('@/shared/api/client', () => ({ api: { briefing: jest.fn() } }));

// O JSON importado tipa `trilhos` como string[]; o schema do contrato valida o conteúdo.
const exemplo = exemploJson as BriefingRequest;

function memoria() {
  const m = new Map<string, string>();
  return {
    getItem: async (k: string) => m.get(k) ?? null,
    setItem: async (k: string, v: string) => void m.set(k, v),
  };
}

async function trajetoDoExemplo() {
  return criarTrajetoStore(memoria()).criar({ nome: 'MASP → Sé', trajeto: exemplo.trajeto });
}

describe('montarBriefingRequest', () => {
  it('trajeto salvo com ônibus e trilhos → BriefingRequest válido no contrato', async () => {
    const pedido = montarBriefingRequest(await trajetoDoExemplo());
    expect(BriefingRequestSchema.safeParse(pedido).success).toBe(true);
    expect(pedido).toEqual(exemplo);
  });
});

describe('useBriefing', () => {
  it('chama POST /v1/briefings com o pedido montado', async () => {
    const salvo = await trajetoDoExemplo();
    (api.briefing as jest.Mock).mockResolvedValue({ veredito: 'FAVORAVEL' });
    const client = novoQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = await renderHook(() => useBriefing(salvo), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.briefing).toHaveBeenCalledWith(exemplo, expect.anything());
  });
});

describe('useUltimoBriefing', () => {
  beforeEach(() => jest.clearAllMocks());

  function wrapperCom(client: ReturnType<typeof novoQueryClient>) {
    return ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }

  it('devolve o briefing guardado sem chamar a API', async () => {
    const salvo = await trajetoDoExemplo();
    const client = novoQueryClient();
    const guardado = { veredito: 'ATENCAO', geradoEm: '2026-10-10T08:00:00-03:00' };
    client.setQueryData(queryKeys.briefing(salvo.id, salvo.atualizadoEm), guardado);
    const { result } = await renderHook(() => useUltimoBriefing(salvo), {
      wrapper: wrapperCom(client),
    });
    expect(result.current).toEqual(guardado);
    expect(api.briefing).not.toHaveBeenCalled();
  });

  it('sem briefing guardado → undefined e nenhuma chamada', async () => {
    const salvo = await trajetoDoExemplo();
    const { result } = await renderHook(() => useUltimoBriefing(salvo), {
      wrapper: wrapperCom(novoQueryClient()),
    });
    expect(result.current).toBeUndefined();
    expect(api.briefing).not.toHaveBeenCalled();
  });
});
