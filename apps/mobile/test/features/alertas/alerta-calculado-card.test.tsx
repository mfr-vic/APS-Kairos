// Cartão de alerta calculado: nível com ícone + texto, título, resumo e conselho.
import { render, screen } from '@testing-library/react-native';

import { AlertaCalculadoCard } from '@/features/alertas/alerta-calculado-card';

describe('AlertaCalculadoCard', () => {
  it('mostra selo do nível, título, resumo e conselho', async () => {
    await render(
      <AlertaCalculadoCard
        alerta={{
          id: 'chuva',
          nivel: 3,
          titulo: 'Chuva forte',
          resumo: '9,1 mm/h às 09:00',
          conselho: 'Melhor aguardar.',
        }}
      />
    );
    expect(screen.getByText('Crítico')).toBeTruthy();
    expect(screen.getByText('Chuva forte')).toBeTruthy();
    expect(screen.getByText('9,1 mm/h às 09:00')).toBeTruthy();
    expect(screen.getByText('Melhor aguardar.')).toBeTruthy();
    expect(screen.getByLabelText('Crítico: Chuva forte. 9,1 mm/h às 09:00. Melhor aguardar.')).toBeTruthy();
  });

  it('nível 0 → "Informativo"', async () => {
    await render(
      <AlertaCalculadoCard
        alerta={{ id: 'x', nivel: 0, titulo: 'T', resumo: 'R', conselho: 'C' }}
      />
    );
    expect(screen.getByText('Informativo')).toBeTruthy();
  });
});
