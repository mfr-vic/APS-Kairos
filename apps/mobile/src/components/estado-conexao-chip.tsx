// Chip de estado no cabeçalho das abas. Reflete a SAÚDE REAL dos dados, não só a rede do
// aparelho (defeito visto no celular em 13/10: "Online" com clima e ar indisponíveis):
//   Demonstração > Offline (salvos / sem conexão) > Atualizando > Servidor fora > Dados parciais > Online.
// Entradas: onlineManager, useIsFetching e o cache do TanStack Query (briefings e tempo agora).
import type { BriefingResponse, Observation } from '@kairos/contracts';
import { onlineManager, useIsFetching, useQueryClient, type QueryCache } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { View } from 'react-native';

import { CHAVE_BRIEFING } from '@/shared/api/query-keys';
import { CONEXAO } from '@/shared/textos';
import { radius, spacing, useColors } from '@/theme';

import { Icon, type IconName } from './icon';
import { ThemedText } from './themed-text';

export type EstadoConexao =
  | 'online'
  | 'atualizando'
  | 'offline'
  | 'semDados'
  | 'demo'
  | 'semServidor'
  | 'parcial';

export type SaudeDados = 'ok' | 'parcial' | 'semServidor';

type Entradas = {
  online: boolean;
  atualizando: boolean;
  temDados: boolean;
  demo: boolean;
  saude?: SaudeDados;
};

export function estadoConexao({ online, atualizando, temDados, demo, saude = 'ok' }: Entradas): EstadoConexao {
  if (demo) return 'demo';
  if (!online) return temDados ? 'offline' : 'semDados';
  if (atualizando) return 'atualizando';
  if (saude === 'semServidor') return 'semServidor';
  if (saude === 'parcial') return 'parcial';
  return 'online';
}

export function ehDemo(briefing: BriefingResponse | undefined): boolean {
  if (!briefing) return false;
  return (
    briefing.atribuicoes.some((a) => /simulad/i.test(a)) ||
    briefing.observacoes.some((o) => o.source.startsWith('simulado:'))
  );
}

type ResumoCache = {
  /** Briefing mais recente (por geradoEm). */
  briefing: BriefingResponse | undefined;
  /** Observação de clima mais recente do "tempo agora". */
  tempo: Observation | undefined;
  /** A última tentativa de alguma consulta ao servidor falhou. */
  houveErro: boolean;
};

/** Saúde dos dados exibidos: servidor falhou na última tentativa, ou veio com fontes indisponíveis. */
export function saudeDosDados({ briefing, tempo, houveErro }: ResumoCache): SaudeDados {
  if (houveErro) return 'semServidor';
  const parcial =
    briefing?.observacoes.some((o) => o.status === 'unavailable') || tempo?.status === 'unavailable';
  return parcial ? 'parcial' : 'ok';
}

function resumirCache(cache: QueryCache): ResumoCache {
  let briefing: BriefingResponse | undefined;
  let tempo: Observation | undefined;
  let tempoEm = 0;
  let houveErro = false;
  for (const q of cache.findAll({ queryKey: [CHAVE_BRIEFING] })) {
    if (q.state.error && q.state.fetchStatus === 'idle') houveErro = true;
    const d = q.state.data as BriefingResponse | undefined;
    if (d && (!briefing || Date.parse(d.geradoEm) > Date.parse(briefing.geradoEm))) briefing = d;
  }
  for (const q of cache.findAll({ queryKey: ['tempo-agora'] })) {
    if (q.state.error && q.state.fetchStatus === 'idle') houveErro = true;
    if (q.state.data && q.state.dataUpdatedAt > tempoEm) {
      tempo = q.state.data as Observation;
      tempoEm = q.state.dataUpdatedAt;
    }
  }
  return { briefing, tempo, houveErro };
}

export const ESTADO_CONEXAO: Record<EstadoConexao, { texto: string; icone: IconName; leitura: string }> = {
  online: { texto: CONEXAO.online, icone: 'online', leitura: 'Online: dados ao vivo' },
  atualizando: { texto: CONEXAO.atualizando, icone: 'atualizar', leitura: 'Atualizando os dados agora' },
  offline: { texto: CONEXAO.offline, icone: 'offline', leitura: 'Offline: mostrando os últimos dados salvos' },
  semDados: { texto: CONEXAO.semDados, icone: 'semDados', leitura: 'Sem conexão e sem dados salvos' },
  demo: { texto: CONEXAO.demo, icone: 'demo', leitura: 'Modo demonstração: dados simulados' },
  semServidor: {
    texto: CONEXAO.semServidor,
    icone: 'semDados',
    leitura: 'Online, mas o servidor do Καιρός não respondeu na última tentativa',
  },
  parcial: {
    texto: CONEXAO.parcial,
    icone: 'atencao',
    leitura: 'Online, mas parte das fontes não respondeu: dados parciais',
  },
};

const assinar = (onChange: () => void) => onlineManager.subscribe(onChange);
const lerOnline = () => onlineManager.isOnline();

export function EstadoConexaoChip() {
  const c = useColors();
  const qc = useQueryClient();
  const online = useSyncExternalStore(assinar, lerOnline, lerOnline);
  const atualizando = useIsFetching() > 0;
  // String primitiva: o useSyncExternalStore só re-renderiza quando o resumo muda de verdade.
  const chave = useSyncExternalStore(
    (onChange) => qc.getQueryCache().subscribe(onChange),
    () => {
      const r = resumirCache(qc.getQueryCache());
      return `${r.briefing ? 1 : 0}|${ehDemo(r.briefing) ? 1 : 0}|${saudeDosDados(r)}`;
    }
  );
  const [temDados, demo, saude] = chave.split('|');
  const estado = estadoConexao({
    online,
    atualizando,
    temDados: temDados === '1',
    demo: demo === '1',
    saude: saude as SaudeDados,
  });
  const { texto, icone, leitura } = ESTADO_CONEXAO[estado];

  return (
    <View
      accessible
      accessibilityLabel={`Estado da conexão: ${leitura}`}
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        alignSelf: 'flex-start',
        paddingHorizontal: spacing.sm,
        minHeight: 28,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: c.onBrandSecondary,
      }}
    >
      <Icon name={icone} size={16} color={c.onBrandSecondary} />
      <ThemedText variant="caption" tone="onBrandSecondary">
        {texto}
      </ThemedText>
    </View>
  );
}
