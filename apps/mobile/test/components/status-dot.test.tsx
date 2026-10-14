// StatusDot: o estado sempre aparece em texto, não só na cor.
import { render, screen } from '@testing-library/react-native';

import { StatusDot } from '@/components/status-dot';

describe('StatusDot', () => {
  it.each(['ok', 'atencao', 'erro', 'neutro'] as const)('%s mostra o texto', async (tom) => {
    await render(<StatusDot tom={tom} texto={`estado ${tom}`} />);
    expect(screen.getByText(`estado ${tom}`)).toBeTruthy();
  });
});
