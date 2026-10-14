// RF17 / TC19 / TC20: aviso de desatualização sobre o último briefing salvo.
// TC19 (API parada) chega como erro da query; TC20 (modo avião) chega como query pausada
// pelo onlineManager, sem erro — os dois precisam do aviso. Diz a idade, a causa, o que está
// sendo mostrado e oferece "Atualizar".
import type { FetchStatus } from '@tanstack/react-query';

import { EstadoTela } from '@/components/estado-tela';
import { mensagemDeErro } from '@/shared/api/errors';
import { ACOES, ESTADOS } from '@/shared/textos';

import { horaSP, haQuantoTempo } from './format';

/** Motivo para avisar que o briefing pode estar velho, ou null se a última atualização deu certo. */
export function motivoDesatualizado(error: unknown, fetchStatus: FetchStatus): string | null {
  if (error) return mensagemDeErro(error);
  if (fetchStatus === 'paused') return ESTADOS.semConexao;
  return null;
}

type Props = {
  geradoEm: string;
  agora: number;
  motivo: string;
  onAtualizar?: () => void;
  atualizando?: boolean;
  offline?: boolean;
};

export function AvisoDesatualizado({ geradoEm, agora, motivo, onAtualizar, atualizando, offline }: Props) {
  return (
    <EstadoTela
      variante="faixa"
      tipo={offline ? 'offline' : 'desatualizado'}
      titulo={`${ESTADOS.desatualizado(haQuantoTempo(geradoEm, agora))} (às ${horaSP(geradoEm)})`}
      texto={`${motivo} ${ESTADOS.mostrandoSalvo}`}
      acao={
        onAtualizar
          ? { rotulo: atualizando ? 'Atualizando…' : ACOES.tentarDeNovo, onPress: onAtualizar, carregando: atualizando, icone: 'atualizar' }
          : undefined
      }
      testID="aviso-desatualizado"
    />
  );
}
