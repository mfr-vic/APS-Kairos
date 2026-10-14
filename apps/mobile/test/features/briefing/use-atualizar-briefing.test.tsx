// "Atualizar" pedido pela pessoa: confirma no snackbar o horário novo, ou diz por que falhou.
import { renderHook } from '@testing-library/react-native';

import * as snackbar from '@/components/snackbar';
import { useAtualizarBriefing } from '@/features/briefing/use-atualizar-briefing';
import { ApiError } from '@/shared/api/errors';

import { fixture } from '../../support/briefing';

describe('useAtualizarBriefing', () => {
  const mostrar = jest.fn();
  beforeEach(() => {
    mostrar.mockClear();
    jest.spyOn(snackbar, 'useSnackbar').mockReturnValue({ mostrar, ocultar: jest.fn() });
  });

  it('sucesso → "Briefing atualizado às HH:MM"', async () => {
    const refetch = jest.fn().mockResolvedValue({ data: fixture('FAVORAVEL'), error: null });
    const { result } = await renderHook(() => useAtualizarBriefing(refetch));
    await result.current();
    expect(mostrar).toHaveBeenCalledWith({ mensagem: 'Briefing atualizado às 08:08' });
  });

  it('falha (mesmo com dado antigo) → snackbar de erro com a causa', async () => {
    const refetch = jest
      .fn()
      .mockResolvedValue({ data: fixture('FAVORAVEL'), error: new ApiError('rede', 'Sem conexão com o servidor.') });
    const { result } = await renderHook(() => useAtualizarBriefing(refetch));
    await result.current();
    expect(mostrar).toHaveBeenCalledWith({ tipo: 'erro', mensagem: 'Não atualizou: Sem conexão com o servidor.' });
  });
});
