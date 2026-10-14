// GET /v1/reports/summary pelo cliente do app: URL com o período e validação pelo contrato 1.6.0.
import { ReportsSummaryResponseSchema } from '@kairos/contracts';

import { buscarRelatorio } from '@/shared/api/relatorio';

import { RELATORIO_EXEMPLO, RELATORIO_VAZIO } from '../../support/relatorio';

const fetchMock = jest.fn();
globalThis.fetch = fetchMock;

const responde = (corpo: unknown) =>
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(corpo), { status: 200, headers: { 'Content-Type': 'application/json' } })
  );

describe('buscarRelatorio', () => {
  beforeEach(() => fetchMock.mockReset());

  it('as fixtures seguem o contrato', () => {
    expect(ReportsSummaryResponseSchema.safeParse(RELATORIO_EXEMPLO).success).toBe(true);
    expect(ReportsSummaryResponseSchema.safeParse(RELATORIO_VAZIO).success).toBe(true);
  });

  it('chama /v1/reports/summary?dias=30 e devolve a resposta validada', async () => {
    responde(RELATORIO_EXEMPLO);
    const r = await buscarRelatorio(30);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/v1\/reports\/summary\?dias=30$/);
    expect(r.totalBriefings).toBe(9);
  });

  it('fora do contrato → ApiError "contrato"', async () => {
    responde({ ...RELATORIO_EXEMPLO, totalBriefings: -1 });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(buscarRelatorio(7)).rejects.toEqual(expect.objectContaining({ tipo: 'contrato' }));
    warn.mockRestore();
  });
});
