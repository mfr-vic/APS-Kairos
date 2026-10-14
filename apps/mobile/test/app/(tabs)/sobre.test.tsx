// Aba Sobre (item 7): chamada realçada para "Como o Καιρός funciona" e entrada do Registro de requisições.
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import SobreScreen from '@/app/(tabs)/sobre';
import { palettes } from '@/theme';

const mockEmpurrar = jest.fn();
jest.mock('@/shared/navegacao/use-navegacao', () => ({ useNavegacao: () => ({ empurrar: mockEmpurrar }) }));
jest.mock('@/components/screen', () => ({
  Screen: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
// O interruptor de lembretes tem testes próprios (test/features/notificacoes/controle-lembretes.test.tsx).
jest.mock('@/features/notificacoes/controle-lembretes', () => ({ ControleLembretes: () => null }));

describe('aba Sobre', () => {
  beforeEach(() => mockEmpurrar.mockClear());

  it('botão realçado (superfície decisaoSoft) abre Como o Καιρός funciona', async () => {
    await render(<SobreScreen />);
    expect(screen.getByTestId('botao-como-funciona')).toHaveStyle({ backgroundColor: palettes.light.decisaoSoft });
    await fireEvent.press(screen.getByRole('button', { name: /^Como o Καιρός funciona/ }));
    expect(mockEmpurrar).toHaveBeenCalledWith('/como-funciona');
  });

  it('abre o Registro de requisições', async () => {
    await render(<SobreScreen />);
    await fireEvent.press(screen.getByRole('button', { name: /^Registro de requisições/ }));
    expect(mockEmpurrar).toHaveBeenCalledWith('/registro-requisicoes');
  });

  it('abre o Relatório do sistema (RF26)', async () => {
    await render(<SobreScreen />);
    await fireEvent.press(screen.getByRole('button', { name: /^Relatório do sistema/ }));
    expect(mockEmpurrar).toHaveBeenCalledWith('/relatorio');
  });
});
