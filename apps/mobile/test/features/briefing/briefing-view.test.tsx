// T15 / RF11–RF14, RF07, RNF11: a tela do briefing na ordem da decisão (herói com ação →
// melhor horário → O que fazer agora → Atrasos e obstáculos → dimensões → atribuições).
import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { BriefingView } from '@/features/briefing/briefing-view';
import { FIXTURES_BRIEFING } from '@/features/briefing/fixtures';
import { VEREDITO } from '@/features/briefing/format';
import type { TrajetoSalvo } from '@/features/trajetos/storage';
import { liberarNavegacao } from '@/shared/navegacao/use-navegacao';

import { comObservacao } from '../../support/briefing';
import { transito } from '../../support/transito';

function fixture(veredito: string) {
  const f = FIXTURES_BRIEFING.find((x) => x.briefing.veredito === veredito);
  if (!f) throw new Error(`sem fixture para ${veredito}`);
  return f.briefing;
}
const doisMinDepois = (iso: string) => Date.parse(iso) + 2 * 60_000;

describe('BriefingView', () => {
  it('ARTESP: detalhes do metrô e trem mostram a explicação da operadora e a fonte de cada linha', async () => {
    const briefing = fixture('ATENCAO');
    await render(
      <BriefingView briefing={briefing} agora={doisMinDepois(briefing.geradoEm)} expandidoInicial />
    );
    expect(screen.getByText('Metrô e trem')).toBeTruthy();
    expect(screen.getByText('“Maiores Intervalos”')).toBeTruthy();
    // A mesma explicação também aparece em "Atrasos e obstáculos" (dentro de um texto maior).
    expect(
      screen.getByText(
        'Devido à atividade de manutenção programada, os trens da Linha 8-Diamante circulam com maiores intervalos entre as estações Barueri e Itapevi.'
      )
    ).toBeTruthy();
    expect(screen.getAllByText('Fonte: ARTESP · ViaMobilidade 8 e 9')).toHaveLength(2); // L8 e L9
  });

  it('as fixtures cobrem os 4 vereditos', async () => {
    expect(new Set(FIXTURES_BRIEFING.map((f) => f.briefing.veredito))).toEqual(
      new Set(['FAVORAVEL', 'ATENCAO', 'AGUARDAR', 'INDETERMINADO'])
    );
  });

  it.each(['FAVORAVEL', 'ATENCAO', 'AGUARDAR', 'INDETERMINADO'] as const)(
    '%s: herói (veredito → ação), confiança, as duas seções de decisão e atribuições',
    async (veredito) => {
      const briefing = fixture(veredito);
      await render(<BriefingView briefing={briefing} agora={doisMinDepois(briefing.geradoEm)} />);
      expect(screen.getByLabelText(new RegExp(`^Veredito: ${VEREDITO[veredito].rotulo}\\. `))).toBeTruthy();
      expect(screen.getByText(/^Confiança (alta|média|baixa)/)).toBeTruthy();
      expect(screen.getByText('O que fazer agora')).toBeTruthy();
      expect(screen.getByText('Atrasos e obstáculos')).toBeTruthy();
      // RNF11: atribuições sempre visíveis, fora de qualquer expansão.
      expect(
        screen.getByText(
          briefing.atribuicoes.length > 0
            ? briefing.atribuicoes.join(' · ')
            : 'Nenhuma fonte respondeu neste briefing.'
        )
      ).toBeTruthy();
    }
  );

  it('ordem de leitura do herói: veredito → ação → porquê → sinais → confiança', async () => {
    const b = fixture('AGUARDAR');
    await render(<BriefingView briefing={b} agora={doisMinDepois(b.geradoEm)} />);
    const rotulo = screen.getByLabelText(/^Veredito: Aguardar\./).props.accessibilityLabel as string;
    const pos = ['Veredito: Aguardar', 'Espere até 11:00', 'Chuva forte prevista', 'Sinais:', 'Confiança média'].map(
      (t) => rotulo.indexOf(t)
    );
    expect(pos.every((p) => p >= 0)).toBe(true);
    expect([...pos].sort((x, y) => x - y)).toEqual(pos);
  });

  it('AGUARDAR: melhor horário grande com o porquê', async () => {
    const b = fixture('AGUARDAR');
    await render(<BriefingView briefing={b} agora={doisMinDepois(b.geradoEm)} />);
    const cartao = screen.getByTestId('melhor-horario');
    expect(within(cartao).getByText('11:00–12:00')).toBeTruthy();
    expect(within(cartao).getByText('Começa em 2 h 50 min.')).toBeTruthy();
  });

  it('FAVORÁVEL: sem cartão de melhor horário', async () => {
    const b = fixture('FAVORAVEL');
    await render(<BriefingView briefing={b} agora={doisMinDepois(b.geradoEm)} />);
    expect(screen.queryByTestId('melhor-horario')).toBeNull();
  });

  it('fonte indisponível vira obstáculo em linguagem humana (não "unavailable")', async () => {
    const b = fixture('AGUARDAR');
    await render(<BriefingView briefing={b} agora={doisMinDepois(b.geradoEm)} />);
    expect(screen.getByText('Metrô e trem: sem dados agora')).toBeTruthy();
    expect(
      screen.getByText('Página do Metrô respondeu HTTP 503. O veredito foi calculado sem o metrô e o trem.')
    ).toBeTruthy();
    expect(screen.queryByText(/unavailable/)).toBeNull();
  });

  it('ar disponível → rótulo de estimativa de modelo SEMPRE visível (RF07)', async () => {
    const b = fixture('ATENCAO');
    await render(<BriefingView briefing={b} agora={doisMinDepois(b.geradoEm)} />);
    expect(screen.getByText(/Estimativa de modelo \(CAMS\)/)).toBeTruthy();
  });

  it('cada dimensão diz como pesou no veredito', async () => {
    const b = fixture('ATENCAO');
    await render(<BriefingView briefing={b} agora={doisMinDepois(b.geradoEm)} />);
    expect(screen.getByText(/^Pesa no veredito: 875A-10 sem previsão de chegada/)).toBeTruthy();
    expect(screen.getByText('Nenhum ponto a até 300 m: não pesa no veredito.')).toBeTruthy();
  });

  // Divulgação progressiva: veículos por linha e fonte só aparecem ao tocar.
  it('seção expande ao toque e expõe accessibilityState', async () => {
    const b = fixture('ATENCAO');
    await render(<BriefingView briefing={b} agora={doisMinDepois(b.geradoEm)} />);
    expect(screen.queryByText('Fonte: SPTrans')).toBeNull();
    const toggles = screen.getAllByLabelText('Ver detalhes');
    expect(toggles[0].props.accessibilityState?.expanded).toBe(false);
    for (const t of toggles) await fireEvent.press(t);
    expect(screen.getByText('Fonte: SPTrans')).toBeTruthy();
    expect(screen.getByText('0 veículos transmitindo')).toBeTruthy();
    expect(screen.getAllByLabelText('Ocultar detalhes')[0].props.accessibilityState?.expanded).toBe(true);
  });

  it('placeholder da API (sem observações) explica e sugere atualizar', async () => {
    const placeholder = FIXTURES_BRIEFING.find((f) => f.briefing.observacoes.length === 0)!.briefing;
    await render(<BriefingView briefing={placeholder} agora={doisMinDepois(placeholder.geradoEm)} />);
    expect(screen.getByText(/O servidor não enviou nenhuma observação/)).toBeTruthy();
  });
});

const TRAJETO: TrajetoSalvo = {
  id: 't1',
  nome: 'Casa → Trabalho',
  criadoEm: '2026-10-10T08:00:00-03:00',
  atualizadoEm: '2026-10-10T08:00:00-03:00',
  trajeto: {
    origem: { lat: -23.5505, lon: -46.6333, rotulo: 'Sé' },
    destino: { lat: -23.5614, lon: -46.6559, rotulo: 'MASP' },
    onibus: [],
    trilhos: [],
  },
};

describe('BriefingView · 14/10/2026 (trânsito, linha reta, atalhos, itinerário)', () => {
  it('seção Trânsito: número grande do atraso, nível, tempos, trechos lentos e © TomTom', async () => {
    const b = comObservacao(fixture('FAVORAVEL'), transito());
    await render(<BriefingView briefing={b} agora={doisMinDepois(b.geradoEm)} expandidoInicial />);
    expect(screen.getByText('Trânsito')).toBeTruthy();
    expect(screen.getByLabelText('Trânsito moderado, +6 min: 28 min agora · 22 min sem trânsito, 8,4 km de carro ou ônibus')).toBeTruthy();
    expect(screen.getByText('Trecho de 1,2 km: lentidão moderada')).toBeTruthy();
    expect(screen.getByText('© TomTom')).toBeTruthy();
    expect(screen.getByText('Atraso abaixo de 15 min e sem trânsito intenso: não pesa no veredito.')).toBeTruthy();
  });

  it('regressão: geometria em linha reta não é apresentada como rota', async () => {
    const b = { ...fixture('FAVORAVEL'), geometria: { fonte: 'linha-reta' as const } };
    await render(<BriefingView briefing={b} agora={doisMinDepois(b.geradoEm)} />);
    expect(screen.queryByText(/linha reta/i)).toBeNull();
    expect(screen.getByText(/sem rota pelas ruas neste briefing/)).toBeTruthy();
  });

  it('atalhos Uber/99 só quando o veredito é Aguardar', async () => {
    const aguardar = fixture('AGUARDAR');
    const { rerender } = await render(<BriefingView briefing={aguardar} agora={doisMinDepois(aguardar.geradoEm)} trajeto={TRAJETO} />);
    expect(screen.getByRole('button', { name: /^Abrir no Uber/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Abrir na 99/ })).toBeTruthy();
    const favoravel = fixture('FAVORAVEL');
    await rerender(<BriefingView briefing={favoravel} agora={doisMinDepois(favoravel.geradoEm)} trajeto={TRAJETO} />);
    expect(screen.queryByRole('button', { name: /^Abrir no Uber/ })).toBeNull();
  });

  it('"Ver itinerário" de cada linha navega uma vez para /trajetos/[id]/itinerario/[linha]', async () => {
    liberarNavegacao();
    const push = jest.spyOn(require('expo-router').router, 'push').mockImplementation(() => {});
    const b = fixture('ATENCAO');
    await render(<BriefingView briefing={b} agora={doisMinDepois(b.geradoEm)} trajeto={TRAJETO} expandidoInicial />);
    const links = screen.getAllByRole('button', { name: /^Ver itinerário da / });
    expect(links.length).toBe(b.observacoes.find((o) => o.dimension === 'rail')!.value!.linhas.length);
    await fireEvent.press(links[0]!);
    expect(push).toHaveBeenCalledWith('/trajetos/t1/itinerario/L8');
    push.mockRestore();
  });

  it('sem trajeto (tela de exemplos) não há atalhos nem link de itinerário', async () => {
    const b = fixture('AGUARDAR');
    await render(<BriefingView briefing={b} agora={doisMinDepois(b.geradoEm)} expandidoInicial />);
    expect(screen.queryByRole('button', { name: /^Abrir no Uber/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Ver itinerário/ })).toBeNull();
  });
});
