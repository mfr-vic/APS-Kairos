// T29 / RF17 / RF03: o persister grava briefings e a lista de linhas de trilho bem-sucedidos.
import { opcoesPersistencia } from '@/shared/api/persister';
import { queryKeys } from '@/shared/api/query-keys';


const grava = (queryKey: readonly unknown[], status: string) =>
  opcoesPersistencia.dehydrateOptions!.shouldDehydrateQuery!({
    queryKey,
    state: { status },
  } as never);

describe('persister', () => {
  it.each([
    [queryKeys.briefing('t1', '2026-10-10T08:00:00Z'), 'success', true],
    [queryKeys.linhasTrilho, 'success', true],
    [queryKeys.linhasTrilho, 'error', false],
    [queryKeys.geocode('Av. Paulista'), 'success', false],
    [queryKeys.providers, 'success', false],
  ])('%j (%s) → %s', (chave, status, esperado) => {
    expect(grava(chave, status)).toBe(esperado);
  });
});
