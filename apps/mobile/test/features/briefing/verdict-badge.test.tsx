// RF11: selo compacto do último veredito (ícone + palavra).
import { render, screen } from '@testing-library/react-native';

import { VerdictBadge } from '@/features/briefing/verdict-badge';

it('mostra o último veredito em texto e no rótulo', async () => {
  await render(<VerdictBadge veredito="AGUARDAR" />);
  expect(screen.getByLabelText('Último veredito: Aguardar')).toBeTruthy();
  expect(screen.getByText('Aguardar')).toBeTruthy();
});
