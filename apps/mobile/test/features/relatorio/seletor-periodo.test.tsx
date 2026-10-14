// RF26: seletor 7 · 30 dias (radiogroup; tocar no marcado não faz nada).
import { fireEvent, render, screen } from '@testing-library/react-native';

import { SeletorPeriodo } from '@/features/relatorio/seletor-periodo';

describe('SeletorPeriodo', () => {
  it('marca o período atual e avisa a troca', async () => {
    const onChange = jest.fn();
    await render(<SeletorPeriodo valor={7} onChange={onChange} />);
    expect(screen.getByRole('radio', { name: 'Últimos 7 dias' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: 'Últimos 7 dias' }));
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('radio', { name: 'Últimos 30 dias' }));
    expect(onChange).toHaveBeenCalledWith(30);
  });
});
