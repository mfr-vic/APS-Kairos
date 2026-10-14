// IconeEmBloco: ícone no bloco com o fundo suave do tom (escala única de cores).
import { render, screen } from '@testing-library/react-native';

import { IconeEmBloco } from '@/components/icone-em-bloco';

it('expõe o tom', async () => {
  await render(<IconeEmBloco icone="atencao" tom="erro" />);
  expect(screen.getByTestId('icone-em-bloco-erro')).toBeTruthy();
});