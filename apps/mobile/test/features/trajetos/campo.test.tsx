// T29: campo de texto do cadastro (rótulo acessível, erro em alerta, confirmação pelo teclado).
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Campo } from '@/features/trajetos/campo';

describe('Campo', () => {
  it('repassa texto e "enter"; mostra o erro', async () => {
    const onChange = jest.fn();
    const onSubmit = jest.fn();
    await render(
      <Campo rotulo="Linha" valor="" erro="Obrigatório." onChange={onChange} onSubmit={onSubmit} />
    );
    await fireEvent.changeText(screen.getByLabelText('Linha'), '875A');
    await fireEvent(screen.getByLabelText('Linha'), 'submitEditing');
    expect(onChange).toHaveBeenCalledWith('875A');
    expect(onSubmit).toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Obrigatório.');
  });
});
