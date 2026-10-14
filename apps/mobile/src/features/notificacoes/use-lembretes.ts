// RF25: estado dos lembretes de saída (TanStack Query sobre o AsyncStorage, como os trajetos) e as
// ações com retorno perceptível (snackbar + háptica). A permissão é relida ao voltar ao app
// (staleTime 0 + focusManager do query-client): a pessoa pode mudá-la nas configurações.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Linking } from 'react-native';

import { useSnackbar } from '@/components/snackbar';
import { usoStore, type TrajetoSalvo } from '@/features/trajetos/storage';
import { feedbackTatil } from '@/shared/feedback-tatil';

import { lerPermissao, pedirPermissao, suportaLembretes, type EstadoPermissao } from './agendar-lembretes';
import {
  ANTECEDENCIA_MIN,
  formatarHorario,
  horarioHabitual,
  somarMinutos,
  type Horario,
} from './horario-habitual';
import { criarLembretesStore, type Lembretes } from './lembretes-store';

export const lembretesStore = criarLembretesStore(AsyncStorage);

export const CHAVE_LEMBRETES_QUERY = ['lembretes'] as const;
export const CHAVE_PERMISSAO_QUERY = ['lembretes', 'permissao'] as const;

/** Sem uso suficiente, o lembrete nasce neste horário e a pessoa ajusta. */
export const HORARIO_SEM_DADOS: Horario = { hora: 7, minuto: 0 };

export const TEXTOS_LEMBRETE = {
  titulo: 'Lembrete de saída',
  geral: 'Lembretes de saída',
  ligado: (h: Horario) => `Lembrete ligado: dias úteis às ${formatarHorario(h)}`,
  desligado: 'Lembrete desligado',
  permissaoNegada: 'Sem permissão para notificar. Libere as notificações do Καιρός nas configurações do aparelho.',
  abrirConfiguracoes: 'Abrir configurações',
  falha: 'Não foi possível salvar o lembrete. Tente de novo.',
  permissao: {
    concedida: 'Notificações permitidas',
    'nao-pedida': 'O aparelho vai pedir permissão quando você ligar um lembrete',
    negada: 'Notificações bloqueadas nas configurações do aparelho',
  } satisfies Record<EstadoPermissao, string>,
} as const;

const LOCAL = { networkMode: 'always', staleTime: Infinity } as const;

export function useLembretes() {
  return useQuery({ queryKey: CHAVE_LEMBRETES_QUERY, queryFn: lembretesStore.ler, ...LOCAL });
}

export function usePermissaoLembretes() {
  return useQuery({
    queryKey: CHAVE_PERMISSAO_QUERY,
    queryFn: lerPermissao,
    networkMode: 'always',
    staleTime: 0,
    enabled: suportaLembretes,
  });
}

export function useAcoesLembrete() {
  const qc = useQueryClient();
  const snackbar = useSnackbar();

  const gravado = (l: Lembretes) => qc.setQueryData(CHAVE_LEMBRETES_QUERY, l);

  function falhou(mensagem: string = TEXTOS_LEMBRETE.falha) {
    feedbackTatil.erro();
    snackbar.mostrar({ tipo: 'erro', mensagem });
  }

  /** Garante a permissão, pedindo só agora (opt-in). false = negada, com o caminho para liberar. */
  async function permitir(): Promise<boolean> {
    let p = await lerPermissao();
    if (p !== 'concedida') p = await pedirPermissao();
    qc.setQueryData(CHAVE_PERMISSAO_QUERY, p);
    if (p === 'concedida') return true;
    feedbackTatil.erro();
    snackbar.mostrar({
      tipo: 'erro',
      mensagem: TEXTOS_LEMBRETE.permissaoNegada,
      acao: { rotulo: TEXTOS_LEMBRETE.abrirConfiguracoes, onPress: () => void Linking.openSettings() },
    });
    return false;
  }

  async function ligar(t: TrajetoSalvo) {
    try {
      if (!(await permitir())) return;
      const uso = await usoStore.ler();
      const habitual = horarioHabitual(uso[t.id] ?? [], Date.now());
      const h = habitual ? somarMinutos(habitual, -ANTECEDENCIA_MIN) : HORARIO_SEM_DADOS;
      // Ligar um lembrete é pedir lembretes: liga também o interruptor geral de Sobre.
      gravado(
        await lembretesStore.definir(t.id, { ...h, origem: habitual ? 'habitual' : 'manual', habitual }, true)
      );
      feedbackTatil.sucesso();
      snackbar.mostrar({ mensagem: TEXTOS_LEMBRETE.ligado(h) });
    } catch {
      falhou();
    }
  }

  async function desligar(id: string) {
    try {
      gravado(await lembretesStore.remover(id));
      feedbackTatil.selecao();
      snackbar.mostrar({ mensagem: TEXTOS_LEMBRETE.desligado });
    } catch {
      falhou();
    }
  }

  /** Ajuste manual (± hora / ± 5 min): a origem passa a ser "manual"; o habitual medido é mantido. */
  async function ajustar(id: string, h: Horario) {
    const atual = qc.getQueryData<Lembretes>(CHAVE_LEMBRETES_QUERY)?.porTrajeto[id];
    if (!atual) return;
    try {
      gravado(await lembretesStore.definir(id, { ...atual, ...h, origem: 'manual' }));
    } catch {
      falhou();
    }
  }

  /** Volta para 10 min antes do horário habitual medido. */
  async function usarHabitual(id: string) {
    const atual = qc.getQueryData<Lembretes>(CHAVE_LEMBRETES_QUERY)?.porTrajeto[id];
    if (!atual?.habitual) return;
    const h = somarMinutos(atual.habitual, -ANTECEDENCIA_MIN);
    try {
      gravado(await lembretesStore.definir(id, { ...atual, ...h, origem: 'habitual' }));
      feedbackTatil.sucesso();
      snackbar.mostrar({ mensagem: TEXTOS_LEMBRETE.ligado(h) });
    } catch {
      falhou();
    }
  }

  async function definirGeral(ativo: boolean) {
    try {
      if (ativo && !(await permitir())) return;
      gravado(await lembretesStore.definirGeral(ativo));
      feedbackTatil.selecao();
    } catch {
      falhou();
    }
  }

  return { ligar, desligar, ajustar, usarHabitual, definirGeral };
}
