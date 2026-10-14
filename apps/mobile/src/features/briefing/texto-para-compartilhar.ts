// Texto pt-BR do briefing para o Share.share (RN): trajeto, veredito, confiança, janela,
// motivos, estado por dimensão, atribuições e horário de geração. Função pura.
import type { BriefingResponse } from '@kairos/contracts';

import { nomeLinhaTrilho } from '@/features/trajetos/linhas-trilho';

import { situacaoDaLinha } from './explicar-fonte';
import { CONFIANCA, DIMENSAO, ESTADO_DADO, horaSP, VEREDITO } from './format';
import { observacao } from './observacao';
import { NIVEL_TRANSITO, temposDoTransito, textoAtraso } from './transito';

export function textoParaCompartilhar(nomeTrajeto: string, b: BriefingResponse): string {
  const janela = b.janelaMeteorologica
    ? `Melhor janela: ${horaSP(b.janelaMeteorologica.inicio)}–${horaSP(b.janelaMeteorologica.fim)}`
    : 'Sem janela favorável nas próximas 6 h';
  const linhas = [
    `Καιρός · ${nomeTrajeto}`,
    `Sair agora? ${VEREDITO[b.veredito].rotulo} — ${VEREDITO[b.veredito].resumo}`,
    `Confiança ${CONFIANCA[b.confianca.nivel].toLowerCase()}${b.confianca.explicacao ? ` (${b.confianca.explicacao})` : ''}`,
    janela,
  ];
  if (b.motivos.length > 0) {
    linhas.push('', 'Motivos:', ...b.motivos.map((m) => `• ${m.texto}`));
  }
  if (b.observacoes.length > 0) {
    linhas.push(
      '',
      'Dados:',
      ...b.observacoes.map(
        (o) => `• ${DIMENSAO[o.dimension]}: ${ESTADO_DADO[o.status]}${o.status === 'unavailable' && o.motivo ? ` (${o.motivo})` : ''}`
      )
    );
  }
  // Linha fora do normal vai com o texto e a explicação da operadora (ex.: trecho com maiores intervalos).
  const trilhos = (observacao(b, 'rail')?.value?.linhas ?? []).filter((l) => l.situacao !== 'NORMAL');
  if (trilhos.length > 0) {
    linhas.push('', 'Metrô e trem:', ...trilhos.map((l) => `• ${nomeLinhaTrilho(l.linha)} — ${situacaoDaLinha(l)}`));
  }
  const transito = observacao(b, 'traffic')?.value;
  if (transito) {
    linhas.push(
      '',
      `Trânsito: ${NIVEL_TRANSITO[transito.nivel].rotulo.toLowerCase()}, ${textoAtraso(transito)} (${temposDoTransito(transito)})`
    );
  }
  if (b.atribuicoes.length > 0) linhas.push('', `Fontes: ${b.atribuicoes.join(' · ')}`);
  linhas.push(`Gerado às ${horaSP(b.geradoEm)}`);
  return linhas.join('\n');
}
