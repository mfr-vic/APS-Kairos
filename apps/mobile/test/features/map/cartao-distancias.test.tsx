// Cartão de distâncias do mapa (14/10/2026): você → origem a pé e origem → destino de carro, por rota
// calculada; sem rota, mensagem honesta e "Tentar de novo" — nunca linha reta.
import type { RotaResponse } from '@kairos/contracts';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { CartaoDistancias, ROTA_INDISPONIVEL } from '@/features/map/cartao-distancias';

const base = {
  coordenadas: [
    [-46.6333, -23.5505],
    [-46.6559, -23.5614],
  ] as [number, number][],
  observedAt: '2026-10-14T08:00:00-03:00',
};
const A_PE: RotaResponse = { ...base, modo: 'a-pe', fonte: 'tomtom', distanciaM: 1000, duracaoS: 780, atrasoTransitoS: null };
const CARRO: RotaResponse = { ...base, modo: 'carro', fonte: 'tomtom', distanciaM: 3100, duracaoS: 600, atrasoTransitoS: 240 };

describe('CartaoDistancias', () => {
  it('com as duas rotas: distância, tempo, trânsito e "© TomTom"', async () => {
    await render(
      <CartaoDistancias
        aPe={{ rota: A_PE, carregando: false }}
        carro={{ rota: CARRO, carregando: false }}
        nomeTrajeto="Casa → Trabalho"
        aviso={null}
        onTentarDeNovo={jest.fn()}
      />
    );
    expect(screen.getByLabelText('Você → origem: 1,0 km, 13 min a pé')).toBeTruthy();
    expect(screen.getByLabelText('Origem → destino · Casa → Trabalho: 3,1 km, 10 min de carro agora, +4 min de trânsito')).toBeTruthy();
    expect(screen.getByText('© TomTom')).toBeTruthy();
    expect(screen.queryByText(/linha reta/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull();
  });

  it('calculando: diz que está calculando, sem número', async () => {
    await render(
      <CartaoDistancias
        aPe={{ rota: undefined, carregando: true }}
        carro={{ rota: undefined, carregando: true }}
        nomeTrajeto={null}
        aviso={null}
        onTentarDeNovo={jest.fn()}
      />
    );
    expect(screen.getByLabelText('Você → origem: Calculando a rota…')).toBeTruthy();
  });

  it('sem rota (503): mensagem honesta, "Tentar de novo" chama o refetch; aviso de posição aproximada visível', async () => {
    const tentar = jest.fn();
    await render(
      <CartaoDistancias
        aPe={{ rota: A_PE, carregando: false }}
        carro={{ rota: undefined, carregando: false }}
        nomeTrajeto={null}
        aviso="Localização aproximada"
        onTentarDeNovo={tentar}
      />
    );
    expect(screen.getByLabelText(`Origem → destino: ${ROTA_INDISPONIVEL}`)).toBeTruthy();
    expect(screen.queryByText(/linha reta/i)).toBeNull();
    expect(screen.getByText('Localização aproximada')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(tentar).toHaveBeenCalledTimes(1);
  });

  it('sem trajeto: só a posição, convidando a cadastrar', async () => {
    await render(<CartaoDistancias aPe={null} carro={null} nomeTrajeto={null} aviso={null} onTentarDeNovo={jest.fn()} />);
    expect(screen.getByText(/Cadastre um trajeto para ver a rota até a origem/)).toBeTruthy();
  });
});
