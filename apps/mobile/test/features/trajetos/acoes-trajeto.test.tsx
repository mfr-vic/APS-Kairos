// Folha de ações do trajeto: todas visíveis. Favoritar ↔ Remover dos favoritos conforme a
// estrela; "Tornar principal" ↔ "Principal automático" conforme o trajeto esteja FIXADO.
import { fireEvent, render, screen } from '@testing-library/react-native';

import { AcoesTrajeto } from '@/features/trajetos/acoes-trajeto';
import type { TrajetoSalvo } from '@/features/trajetos/storage';

const t: TrajetoSalvo = {
  id: 't1',
  nome: 'Rolê',
  criadoEm: '2026-10-10T08:00:00-03:00',
  atualizadoEm: '2026-10-10T08:00:00-03:00',
  trajeto: {
    origem: { lat: -23.5, lon: -46.6, rotulo: 'Casa' },
    destino: { lat: -23.5, lon: -46.6, rotulo: 'Parque' },
    onibus: [],
    trilhos: [],
  },
};

const callbacks = () => ({
  onVerBriefing: jest.fn(),
  onAlternarFavorito: jest.fn(),
  onTornarPrincipal: jest.fn(),
  onPrincipalAutomatico: jest.fn(),
  onEditar: jest.fn(),
  onExcluir: jest.fn(),
});

describe('AcoesTrajeto', () => {
  it('cada ação chama o seu callback', async () => {
    const cb = callbacks();
    await render(<AcoesTrajeto trajeto={t} principal={false} {...cb} />);
    await fireEvent.press(screen.getByRole('button', { name: /^Ver briefing/ }));
    await fireEvent.press(screen.getByRole('button', { name: /^Favoritar\. Fica no topo da lista/ }));
    await fireEvent.press(screen.getByRole('button', { name: /^Tornar principal/ }));
    await fireEvent.press(screen.getByRole('button', { name: /^Editar/ }));
    await fireEvent.press(screen.getByRole('button', { name: /^Excluir trajeto\. Sai da lista na hora; dá para desfazer/ }));
    expect(cb.onVerBriefing).toHaveBeenCalledTimes(1);
    expect(cb.onAlternarFavorito).toHaveBeenCalledTimes(1);
    expect(cb.onTornarPrincipal).toHaveBeenCalledTimes(1);
    expect(cb.onEditar).toHaveBeenCalledTimes(1);
    expect(cb.onExcluir).toHaveBeenCalledTimes(1);
    expect(cb.onPrincipalAutomatico).not.toHaveBeenCalled();
  });

  it('favorito: oferece "Remover dos favoritos" e mostra o estado no subtítulo', async () => {
    const cb = callbacks();
    await render(<AcoesTrajeto trajeto={{ ...t, favorito: true }} principal={false} {...cb} />);
    expect(screen.queryByRole('button', { name: /^Favoritar/ })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /^Remover dos favoritos\. Sai da seção Favoritos/ }));
    expect(cb.onAlternarFavorito).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Casa → Parque · favorito')).toBeTruthy();
  });

  it('principal sugerido (não fixado): ainda dá para fixar', async () => {
    await render(<AcoesTrajeto trajeto={t} principal {...callbacks()} />);
    expect(screen.getByRole('button', { name: /^Tornar principal\. Fixa este trajeto/ })).toBeTruthy();
    expect(screen.getByText('Casa → Parque · principal agora')).toBeTruthy();
  });

  it('principal fixado: troca "Tornar principal" por "Principal automático"', async () => {
    const cb = callbacks();
    await render(<AcoesTrajeto trajeto={{ ...t, principal: true, favorito: true }} principal {...cb} />);
    expect(screen.queryByRole('button', { name: /^Tornar principal/ })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /^Principal automático/ }));
    expect(cb.onPrincipalAutomatico).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Casa → Parque · favorito · principal fixado')).toBeTruthy();
  });
});
