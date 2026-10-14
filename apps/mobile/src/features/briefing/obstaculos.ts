// "Atrasos e obstáculos": fatos que atrapalham o trajeto (ônibus demorando ou sem previsão,
// linha alterada/paralisada, alagamento) e fontes que falharam, ditas em linguagem humana.
// Função pura. Chuva e ar não entram aqui: são condições, tratadas em "O que fazer agora".
import type { BriefingResponse, Dimension } from '@kairos/contracts';

import type { IconName } from '@/components/icon';
import { nomeLinhaTrilho } from '@/features/trajetos/linhas-trilho';
import type { Tom } from '@/theme';

import { DIMENSAO_NA_FRASE, explicarMotivo, situacaoDaLinha } from './explicar-fonte';
import { decimal, haQuantoTempo, horaSP } from './format';
import { CHUVA_MODERADA_MM, ONIBUS_DEMORANDO_MIN } from './limiares';
import { alagamentoMaisProximo, chegadas, emMinutos, noPonto, picoDeChuva } from './leituras';
import { observacao } from './observacao';
import { ICONE_DIMENSAO } from './sinais-do-briefing';
import { atrasoMin, NIVEL_TRANSITO, temposDoTransito, textoAtraso, transitoPesado } from './transito';

export type Obstaculo = { id: string; tom: Tom; icone: IconName; titulo: string; texto: string };

const TITULO_DIMENSAO: Record<Dimension, string> = {
  bus: 'Ônibus',
  rail: 'Metrô e trem',
  weather: 'Previsão do tempo',
  air: 'Qualidade do ar',
  flood: 'Alagamento',
  traffic: 'Trânsito',
};

const ORDEM_TOM: Record<Tom, number> = { erro: 0, atencao: 1, neutro: 2, ok: 3 };

export function obstaculos(b: BriefingResponse, agora: number): Obstaculo[] {
  const lista: Obstaculo[] = [];

  const bus = observacao(b, 'bus');
  if (bus?.value) {
    const ponto = noPonto(bus.value);
    for (const c of chegadas(bus.value, agora)) {
      if (c.minutos === null) {
        lista.push({
          id: `onibus-${c.codigoLinha}`,
          tom: 'atencao',
          icone: 'onibus',
          titulo: `${c.letreiro} sem previsão de chegada`,
          texto: `A SPTrans não informou horário ${ponto}. Confira no ponto ou use outra linha.`,
        });
      } else if (c.minutos > ONIBUS_DEMORANDO_MIN) {
        lista.push({
          id: `onibus-${c.codigoLinha}`,
          tom: 'atencao',
          icone: 'onibus',
          titulo: `${c.letreiro} só às ${horaSP(c.horario!)}`,
          texto: `Chega ${emMinutos(c.minutos)} ${ponto}: espera acima de ${ONIBUS_DEMORANDO_MIN} min.`,
        });
      }
    }
  }

  for (const l of observacao(b, 'rail')?.value?.linhas ?? []) {
    const nome = nomeLinhaTrilho(l.linha);
    const fonte = situacaoDaLinha(l);
    if (l.situacao === 'PARALISADA') {
      lista.push({ id: `trilho-${l.linha}`, tom: 'erro', icone: 'bloqueio', titulo: `${nome} paralisada`, texto: fonte });
    } else if (l.situacao === 'ALTERADA') {
      lista.push({ id: `trilho-${l.linha}`, tom: 'atencao', icone: 'metro', titulo: `${nome} com operação alterada`, texto: fonte });
    } else if (l.situacao === 'DESCONHECIDA') {
      lista.push({ id: `trilho-${l.linha}`, tom: 'neutro', icone: 'metro', titulo: `${nome}: situação não identificada`, texto: fonte });
    }
  }

  const flood = observacao(b, 'flood')?.value;
  const d = flood ? alagamentoMaisProximo(flood) : null;
  if (flood && d !== null) {
    const clima = observacao(b, 'weather')?.value;
    const p = clima ? picoDeChuva(clima, agora) : null;
    const local = flood.pontos.find((x) => Math.round(x.distanciaM) === d)?.local;
    const onde = local ? ` (${local})` : '';
    lista.push(
      p && p.mm > CHUVA_MODERADA_MM
        ? {
            id: 'alagamento',
            tom: 'erro',
            icone: 'alagamento',
            titulo: `Alagamento possível a ${d} m do trajeto`,
            texto: `Ponto histórico${onde} com chuva de ${decimal(p.mm)} mm/h ${p.hora ? `às ${horaSP(p.hora)}` : 'agora'}.`,
          }
        : {
            id: 'alagamento',
            tom: 'neutro',
            icone: 'alagamento',
            titulo: `Histórico de alagamento a ${d} m`,
            texto: `${flood.pontos.length} ${flood.pontos.length === 1 ? 'ponto' : 'pontos'} a até ${flood.raioM} m${onde}; só preocupa com chuva acima de ${decimal(CHUVA_MODERADA_MM)} mm/h.`,
          }
    );
  }

  const transito = observacao(b, 'traffic')?.value;
  if (transito && transito.nivel !== 'LIVRE' && atrasoMin(transito) > 0) {
    const n = transito.trechosLentos.length;
    lista.push({
      id: 'transito',
      tom: transitoPesado(transito) ? 'atencao' : 'neutro',
      icone: ICONE_DIMENSAO.traffic,
      titulo: `Trânsito ${NIVEL_TRANSITO[transito.nivel].rotulo.toLowerCase()}: ${textoAtraso(transito)}`,
      texto: `De carro ou ônibus: ${temposDoTransito(transito)}${n > 0 ? ` · ${n} ${n === 1 ? 'trecho lento' : 'trechos lentos'}` : ''}.`,
    });
  }

  // Fontes: indisponível (fora do veredito) ou desatualizada (entra, mas com idade).
  for (const o of b.observacoes) {
    if (o.status === 'unavailable') {
      lista.push({
        id: `fonte-${o.dimension}`,
        tom: 'neutro',
        icone: ICONE_DIMENSAO[o.dimension],
        titulo: `${TITULO_DIMENSAO[o.dimension]}: sem dados agora`,
        texto: `${explicarMotivo(o.source, o.motivo)}. O veredito foi calculado sem ${DIMENSAO_NA_FRASE[o.dimension]}.`,
      });
    } else if (o.status === 'stale') {
      lista.push({
        id: `fonte-${o.dimension}`,
        tom: 'neutro',
        icone: 'desatualizado',
        titulo: `${TITULO_DIMENSAO[o.dimension]}: dado ${o.observedAt ? haQuantoTempo(o.observedAt, agora) : 'antigo'}`,
        texto: o.motivo
          ? `${explicarMotivo(o.source, o.motivo)}.`
          : 'A fonte não atualizou a tempo; o veredito usa o último dado dela.',
      });
    }
  }

  return lista.sort((a, x) => ORDEM_TOM[a.tom] - ORDEM_TOM[x.tom]);
}

/** Frase para a lista vazia: afirma só o que foi de fato verificado. */
export function resumoSemObstaculos(b: BriefingResponse): string {
  const verificado: string[] = [];
  if (observacao(b, 'bus')?.value) verificado.push(`ônibus chegando em até ${ONIBUS_DEMORANDO_MIN} min`);
  if (observacao(b, 'rail')?.value) verificado.push('metrô e trem sem alteração');
  if (observacao(b, 'flood')?.value) verificado.push('nenhum alagamento no caminho');
  if (observacao(b, 'traffic')?.value) verificado.push('trânsito sem lentidão');
  if (verificado.length === 0) return 'As fontes que responderam não indicam atraso nem bloqueio.';
  const lista =
    verificado.length === 1
      ? verificado[0]
      : `${verificado.slice(0, -1).join(', ')} e ${verificado[verificado.length - 1]}`;
  return `${lista.charAt(0).toUpperCase()}${lista.slice(1)}.`;
}
