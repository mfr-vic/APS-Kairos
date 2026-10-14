// C.5, opção B (10/10/2026): observedAt de `current` = fim do intervalo da fonte, limitado a agora.
import { describe, expect, it } from 'vitest';
import { fimDoIntervaloIso } from '../../../src/providers/weather/open-meteo-time.js';

describe('fimDoIntervaloIso', () => {
  it('hora do ar (3600 s): 08:00 → 09:00 quando agora já passou', () => {
    expect(fimDoIntervaloIso('2026-10-10T08:00', -10800, 3600, Date.parse('2026-10-10T13:00:00Z'))).toBe(
      '2026-10-10T09:00:00-03:00',
    );
  });

  it('limita a agora dentro do intervalo', () => {
    expect(fimDoIntervaloIso('2026-10-10T08:00', -10800, 3600, Date.parse('2026-10-10T11:20:30Z'))).toBe(
      '2026-10-10T08:20:30-03:00',
    );
  });

  it('atravessa a meia-noite e respeita o deslocamento', () => {
    expect(fimDoIntervaloIso('2026-10-10T23:45', -10800, 900, Date.parse('2026-10-12T00:00:00Z'))).toBe(
      '2026-10-11T00:00:00-03:00',
    );
    expect(fimDoIntervaloIso('2026-10-10T08:00', 0, 900, Date.parse('2026-10-12T00:00:00Z'))).toBe(
      '2026-10-10T08:15:00+00:00',
    );
  });
});
