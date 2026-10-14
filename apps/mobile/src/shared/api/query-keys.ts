export const CHAVE_BRIEFING = 'briefing';
export const CHAVE_LINHAS_TRILHO = 'linhas-trilho';

export const queryKeys = {
  trajetos: ['trajetos'] as const,
  trajeto: (id: string) => ['trajetos', id] as const,
  /** Inclui `atualizadoEm`: editar o trajeto invalida o briefing anterior. */
  briefing: (trajetoId: string, atualizadoEm: string) =>
    [CHAVE_BRIEFING, trajetoId, atualizadoEm] as const,
  briefingsDoTrajeto: (trajetoId: string) => [CHAVE_BRIEFING, trajetoId] as const,
  geocode: (q: string) => ['geocode', q] as const,
  linhasOnibus: (q: string) => ['onibus', 'linhas', q] as const,
  paradasOnibus: (codigoLinha: number) => ['onibus', 'paradas', codigoLinha] as const,
  linhasTrilho: [CHAVE_LINHAS_TRILHO] as const,
  /** Coordenadas já arredondadas (3 casas) para o cache não fragmentar. */
  tempoAgora: (lat: number, lon: number) => ['tempo-agora', lat, lon] as const,
  health: ['health'] as const,
  providers: ['health', 'providers'] as const,
};
