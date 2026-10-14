// Entrada/Revelar: animação é só apresentação; o conteúdo sempre renderiza. Stagger limitado
// e tudo desligado com movimento reduzido.
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Entrada, entradaEscalonada, Revelar } from '@/components/entrada';
import { motion } from '@/theme';

let mockReduzido = false;
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => mockReduzido,
}));

beforeEach(() => {
  mockReduzido = false;
});

it('renderiza o conteúdo', async () => {
  await render(
    <Entrada comLayout>
      <Revelar>
        <Text>dentro</Text>
      </Revelar>
    </Entrada>
  );
  expect(screen.getByText('dentro')).toBeTruthy();
});

it('entrada e saída animadas; movimento reduzido desliga as duas', async () => {
  await render(
    <Entrada testID="e" comLayout>
      <Text>x</Text>
    </Entrada>
  );
  expect(screen.getByTestId('e').props.entering).toBeDefined();
  expect(screen.getByTestId('e').props.layout).toBeDefined();

  mockReduzido = true;
  await render(
    <Entrada testID="e" comLayout>
      <Text>x</Text>
    </Entrada>
  );
  expect(screen.getByTestId('e').props.entering).toBeUndefined();
  expect(screen.getByTestId('e').props.layout).toBeUndefined();
});

it('stagger: um degrau por item até o limite; depois, todos juntos com o último', () => {
  const ultimo = motion.escalonamentoMaxItens - 1;
  expect(entradaEscalonada(0)).toBeDefined();
  expect(entradaEscalonada(ultimo + 10)).toBe(entradaEscalonada(ultimo));
  expect(entradaEscalonada(-3)).toBe(entradaEscalonada(0));
  // Atraso máximo: (6 − 1) × 40 ms = 200 ms — a lista inteira chega em < 0,5 s.
  expect(ultimo * motion.escalonamento + motion.slow).toBeLessThan(500);
});
