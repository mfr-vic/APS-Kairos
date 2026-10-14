import { fireEvent, render, screen } from '@testing-library/react-native';

import { estacoesDaLinha } from '@/features/itinerario/estacoes-da-linha';
import { ItinerarioView } from '@/features/itinerario/itinerario-view';
import type { TrajetoSalvo } from '@/features/trajetos/storage';

import { AGORA, comObservacao, fixture, trilhos } from '../../support/briefing';

const L2 = estacoesDaLinha('L2')!;
const coord = (nome: string) => L2.estacoes.find((e) => e.nome === nome)!.coordenada!;
const ao = (c: { lat: number; lon: number }, dLat = 0.002) => ({ lat: c.lat + dLat, lon: c.lon });

function trajeto(
  origem: { lat: number; lon: number },
  destino: { lat: number; lon: number }
): TrajetoSalvo {
  return {
    id: 't1',
    nome: 'Casa → Trabalho',
    criadoEm: '2026-10-10T08:00:00-03:00',
    atualizadoEm: '2026-10-10T08:00:00-03:00',
    trajeto: {
      origem: { ...origem, rotulo: 'Casa' },
      destino: { ...destino, rotulo: 'Trabalho' },
      onibus: [],
      trilhos: ['L2'],
    },
  } as TrajetoSalvo;
}

// Como na referência: perto da Vila Madalena, indo à Paraíso → sentido Vila Prudente.
const MADALENA_PARAISO = trajeto(ao(coord('Vila Madalena')), ao(coord('Paraíso'), -0.002));

describe('ItinerarioView', () => {
  it('infere o sentido e destaca embarque, desembarque e o trecho entre eles', async () => {
    await render(
      <ItinerarioView
        linha="L2"
        trajeto={MADALENA_PARAISO}
        dados={L2}
        briefing={undefined}
        agora={AGORA}
      />
    );
    expect(screen.getByTestId('itinerario-sentido')).toHaveTextContent('Vila Prudente');
    expect(screen.getByTestId('itinerario-resumo')).toHaveTextContent(
      '6 estações de Vila Madalena a Paraíso'
    );
    expect(
      screen.getByLabelText('Vila Madalena, 1ª estação, embarque, estação mais próxima da origem')
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Clínicas, 3ª estação, entre o embarque e o desembarque')
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Paraíso, 7ª estação, desembarque, estação mais próxima do destino')
    ).toBeTruthy();
    expect(screen.getByLabelText('Ana Rosa, 8ª estação')).toBeTruthy();
    expect(screen.getByText('Estação mais próxima da origem')).toBeTruthy();
    expect(screen.getByText('Mais próxima do destino')).toBeTruthy();
  });

  it('"Trocar sentido" inverte a lista e mantém embarque e desembarque', async () => {
    await render(
      <ItinerarioView
        linha="L2"
        trajeto={MADALENA_PARAISO}
        dados={L2}
        briefing={undefined}
        agora={AGORA}
      />
    );
    await fireEvent.press(screen.getByTestId('itinerario-trocar-sentido'));
    expect(screen.getByTestId('itinerario-sentido')).toHaveTextContent('Vila Madalena');
    expect(screen.getByLabelText('Vila Prudente, 1ª estação')).toBeTruthy();
    expect(
      screen.getByLabelText(
        'Vila Madalena, 14ª estação, embarque, estação mais próxima da origem, terminal'
      )
    ).toBeTruthy();
  });

  it('destino longe da linha: avisa em vez de marcar desembarque', async () => {
    const longe = trajeto(ao(coord('Vila Madalena')), { lat: -23.7, lon: -46.75 });
    await render(
      <ItinerarioView linha="L2" trajeto={longe} dados={L2} briefing={undefined} agora={AGORA} />
    );
    expect(screen.getByTestId('itinerario-resumo')).toHaveTextContent(
      /O destino fica a .* km .*desembarque não foi marcado/
    );
    expect(screen.queryByText('Mais próxima do destino')).toBeNull();
  });

  it('linha sem coordenadas: lista as estações e explica que não dá para marcar', async () => {
    const sem = { ...L2, estacoes: L2.estacoes.map((e) => ({ nome: e.nome, coordenada: null })) };
    await render(
      <ItinerarioView
        linha="L2"
        trajeto={MADALENA_PARAISO}
        dados={sem}
        briefing={undefined}
        agora={AGORA}
      />
    );
    expect(screen.getByTestId('itinerario-resumo')).toHaveTextContent(
      /Sem a localização das estações/
    );
    expect(screen.getByText('14 estações')).toBeTruthy();
    expect(screen.getByLabelText('Paraíso, 8ª estação, sem localização conhecida')).toBeTruthy();
  });

  it('situação da linha vem do último briefing, com fonte e recência', async () => {
    const b = comObservacao(
      fixture('FAVORAVEL'),
      trilhos([{ linha: 'L2', situacao: 'NORMAL', statusTexto: 'Operação Normal' }])
    );
    await render(
      <ItinerarioView linha="L2" trajeto={MADALENA_PARAISO} dados={L2} briefing={b} agora={AGORA} />
    );
    expect(screen.getByText('Operação Normal')).toBeTruthy();
    expect(screen.getByText(/Direto do Metrô · atualizado há 4 min/)).toBeTruthy();
  });

  it('linha em implantação (L6): mostra o aviso de estações possivelmente em obras; L2 não', async () => {
    const L6 = estacoesDaLinha('L6')!;
    const [primeira, ultima] = [L6.estacoes[0]!.coordenada!, L6.estacoes[L6.estacoes.length - 1]!.coordenada!];
    await render(
      <ItinerarioView linha="L6" trajeto={trajeto(primeira, ultima)} dados={L6} briefing={undefined} agora={AGORA} />
    );
    expect(screen.getByTestId('itinerario-aviso')).toBeTruthy();
    expect(screen.getByText('Linha em implantação')).toBeTruthy();
    expect(screen.getByText(/algumas podem ainda estar em obras/)).toBeTruthy();
    // a lista da ARTESP continua inteira (decisão do usuário: avisar, não esconder)
    expect(screen.getByText(`${L6.estacoes.length} estações`)).toBeTruthy();

    await render(
      <ItinerarioView linha="L2" trajeto={MADALENA_PARAISO} dados={L2} briefing={undefined} agora={AGORA} />
    );
    expect(screen.queryByTestId('itinerario-aviso')).toBeNull();
  });

  it('sem briefing: diz que a situação ainda não foi consultada (nada inventado)', async () => {
    await render(
      <ItinerarioView
        linha="L2"
        trajeto={MADALENA_PARAISO}
        dados={L2}
        briefing={undefined}
        agora={AGORA}
      />
    );
    expect(screen.getByText('Situação ainda não consultada')).toBeTruthy();
  });
});
