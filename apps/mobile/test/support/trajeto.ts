// Trajeto salvo mínimo para testes que só precisam de id e nome.
import type { TrajetoSalvo } from '@/features/trajetos/storage';

export const TRAJETO_EXEMPLO: TrajetoSalvo = {
  id: 't1',
  nome: 'Casa → Faculdade',
  criadoEm: '2026-10-10T08:00:00-03:00',
  atualizadoEm: '2026-10-10T08:00:00-03:00',
  trajeto: {
    origem: { lat: -23.5, lon: -46.6, rotulo: 'Casa' },
    destino: { lat: -23.55, lon: -46.63, rotulo: 'Faculdade' },
    onibus: [],
    trilhos: [],
  },
};
