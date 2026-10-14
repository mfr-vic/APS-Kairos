// Topo da tela inicial em todos os estados: consultando (esqueleto), erro sem salvo (causa +
// Tentar de novo), com briefing (herói), e Desatualizado quando a atualização falha.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useBriefing } from '@/features/briefing/use-briefing';
import { MotivoDoDestaque, PainelPrincipal } from '@/features/trajetos/painel-principal';
import type { TrajetoSalvo } from '@/features/trajetos/storage';
import { api } from '@/shared/api/client';
import { ApiError } from '@/shared/api/errors';
import { liberarNavegacao } from '@/shared/navegacao/use-navegacao';

import { AGORA, fixture } from '../../support/briefing';
import { novoQueryClient, renderComQuery } from '../../support/render-com-query';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/shared/api/client', () => ({ api: { briefing: jest.fn() } }));

const trajeto: TrajetoSalvo = {
  id: 't1',
  nome: 'Casa → Trabalho',
  criadoEm: '2026-10-10T08:00:00-03:00',
  atualizadoEm: '2026-10-10T08:00:00-03:00',
  principal: true,
  trajeto: {
    origem: { lat: -23.561, lon: -46.655, rotulo: 'Paulista' },
    destino: { lat: -23.533, lon: -46.634, rotulo: 'Sé' },
    onibus: [],
    trilhos: [],
  },
};

function Painel() {
  const briefing = useBriefing(trajeto);
  return <PainelPrincipal trajeto={trajeto} briefing={briefing} agora={AGORA} />;
}

describe('PainelPrincipal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    liberarNavegacao();
  });

  it('consultando → esqueleto; depois o herói com a ação; toque abre o briefing', async () => {
    (api.briefing as jest.Mock).mockResolvedValue(fixture('AGUARDAR'));
    await renderComQuery(<Painel />);
    expect(screen.getByTestId('heroi-esqueleto')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Espere até 11:00')).toBeTruthy());
    expect(screen.getByTestId('melhor-horario')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /^Casa → Trabalho\. Veredito: Aguardar/ }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/trajetos/[id]/briefing', params: { id: 't1' } });
  });

  it('erro sem briefing salvo → causa + "Tentar de novo" (sem spinner)', async () => {
    (api.briefing as jest.Mock).mockRejectedValue(new ApiError('rede', 'Sem conexão com o servidor do Καιρός.'));
    await renderComQuery(<Painel />);
    await waitFor(() => expect(screen.getByText('Não foi possível consultar “Casa → Trabalho”')).toBeTruthy());
    expect(screen.getByText(/^Sem conexão com o servidor do Καιρός\. O trajeto continua salvo/)).toBeTruthy();
    (api.briefing as jest.Mock).mockResolvedValue(fixture('FAVORAVEL'));
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(screen.getByText('Saia agora')).toBeTruthy());
  });

  it('atualização falhou com briefing salvo → herói + aviso Desatualizado com a causa', async () => {
    const client = novoQueryClient();
    client.setQueryData(['briefing', 't1', trajeto.atualizadoEm], fixture('FAVORAVEL'));
    (api.briefing as jest.Mock).mockRejectedValue(new ApiError('tempo-esgotado', 'A API não respondeu em 8 s.'));
    await renderComQuery(<Painel />, client);
    await client.refetchQueries();
    await waitFor(() => expect(screen.getByTestId('aviso-desatualizado')).toBeTruthy());
    expect(screen.getByText('A API não respondeu em 8 s. Mostrando o último briefing salvo.')).toBeTruthy();
    expect(screen.getByText('Saia agora')).toBeTruthy();
  });
});

describe('MotivoDoDestaque', () => {
  it('fixado: diz que foi a pessoa e oferece "Automático"', async () => {
    const automatico = jest.fn();
    await renderComQuery(
      <MotivoDoDestaque destaque={{ tipo: 'fixado', texto: 'Fixado por você no topo' }} onAutomatico={automatico} />
    );
    expect(screen.getByText('Fixado por você no topo')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /^Automático: deixar de fixar/ }));
    expect(automatico).toHaveBeenCalledTimes(1);
  });

  it('sugerido pela hierarquia: só o porquê, sem botão', async () => {
    await renderComQuery(
      <MotivoDoDestaque
        destaque={{ tipo: 'habito', texto: 'Sugerido agora: você costuma abri-lo neste horário' }}
        onAutomatico={jest.fn()}
      />
    );
    expect(screen.getByText('Sugerido agora: você costuma abri-lo neste horário')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('PainelPrincipal com destaque mostra o motivo acima do herói', async () => {
    (api.briefing as jest.Mock).mockResolvedValue(fixture('FAVORAVEL'));
    function ComMotivo() {
      const briefing = useBriefing(trajeto);
      return (
        <PainelPrincipal
          trajeto={trajeto}
          briefing={briefing}
          agora={AGORA}
          destaque={{ tipo: 'favorito', texto: 'Primeiro dos seus favoritos' }}
        />
      );
    }
    await renderComQuery(<ComMotivo />);
    expect(screen.getByText('Primeiro dos seus favoritos')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Saia agora')).toBeTruthy());
  });
});