// Aba Alertas: cartão compacto expansível (detalhes e fonte só ao tocar).
import { fireEvent, render, screen } from '@testing-library/react-native';

import { AlertaCard } from '@/features/alertas/alerta-card';
import { ALERTAS } from '@/features/alertas/alertas-conteudo';

const alerta = ALERTAS[0];

describe('AlertaCard', () => {
  it('compacto: título e resumo visíveis, detalhes e fonte escondidos', async () => {
    await render(<AlertaCard alerta={alerta} />);
    expect(screen.getByText(alerta.titulo)).toBeTruthy();
    expect(screen.getByText(alerta.resumo)).toBeTruthy();
    expect(screen.queryByText(`Fonte: ${alerta.fonte}`)).toBeNull();
    const cartao = screen.getByLabelText(`${alerta.titulo}. ${alerta.resumo}`);
    expect(cartao.props.accessibilityState?.expanded).toBe(false);
  });

  it('expande ao tocar: detalhes, fonte e accessibilityState', async () => {
    await render(<AlertaCard alerta={alerta} />);
    const cartao = screen.getByLabelText(`${alerta.titulo}. ${alerta.resumo}`);
    await fireEvent.press(cartao);
    expect(cartao.props.accessibilityState?.expanded).toBe(true);
    expect(screen.getByText(alerta.detalhes[0])).toBeTruthy();
    expect(screen.getByText(`Fonte: ${alerta.fonte}`)).toBeTruthy();
  });

  // Defeito visto no aparelho (13/10): aviso informativo ganhava destaque de alerta.
  it('destaque segue o nível real do tema: informativo diz "Informativo", não "Crítico"', async () => {
    await render(<AlertaCard alerta={alerta} nivel={0} />);
    expect(screen.getByText(/Informativo no seu trajeto/)).toBeTruthy();
    expect(screen.queryByText(/Crítico/)).toBeNull();
  });

  it('nível crítico aparece como "Crítico no seu trajeto"', async () => {
    await render(<AlertaCard alerta={alerta} nivel={3} />);
    expect(screen.getByText(/Crítico no seu trajeto/)).toBeTruthy();
  });

  it('sem alerta ativo do tema: sem destaque', async () => {
    await render(<AlertaCard alerta={alerta} />);
    expect(screen.queryByText(/no seu trajeto/)).toBeNull();
  });

  it('todo cartão do conteúdo tem resumo de 1 linha e fonte nomeada', async () => {
    for (const a of ALERTAS) {
      expect(a.resumo.length).toBeGreaterThan(0);
      expect(a.fonte.length).toBeGreaterThan(0);
      expect(a.detalhes.length).toBeGreaterThan(0);
    }
  });
});
