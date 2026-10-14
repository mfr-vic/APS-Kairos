// RF12 / TC15: o selo de recência destaca dados desatualizados e indisponíveis.
import { render, screen } from '@testing-library/react-native';

import { FreshnessBadge } from '@/features/briefing/freshness-badge';

const AGORA = Date.parse('2026-10-10T08:10:00-03:00');
const HA_7_MIN = '2026-10-10T08:03:00-03:00';

describe('FreshnessBadge', () => {
  it('fresh → "há N min"', async () => {
    await render(<FreshnessBadge status="fresh" observedAt={HA_7_MIN} agora={AGORA} />);
    expect(screen.getByText('há 7 min')).toBeTruthy();
  });

  it('stale → "desatualizado"', async () => {
    await render(<FreshnessBadge status="stale" observedAt={HA_7_MIN} agora={AGORA} />);
    expect(screen.getByText('desatualizado · há 7 min')).toBeTruthy();
  });

  it('unavailable sem horário → "indisponível"', async () => {
    await render(<FreshnessBadge status="unavailable" observedAt={null} agora={AGORA} />);
    expect(screen.getByText('indisponível')).toBeTruthy();
  });
});
