// "O que fazer agora": transforma o briefing em ações concretas e verificáveis (função pura).
// Regra de ouro: só recomenda o que os dados sustentam. Nada de rota multimodal inventada:
// alternativas são só entre as linhas que a pessoa já vinculou ao trajeto.
import type { BriefingResponse, RailSituation } from '@kairos/contracts';

import type { IconName } from '@/components/icon';
import { canaisOficiais, nomeLinhaTrilho } from '@/features/trajetos/linhas-trilho';
import type { Tom } from '@/theme';

import { detalheDaLinha, explicarMotivo, nomeDaFonte, situacaoDaLinha } from './explicar-fonte';
import { decimal, haQuantoTempo, horaSP } from './format';
import {
  CHUVA_FORTE_MM,
  CHUVA_MODERADA_MM,
  ONIBUS_DEMORANDO_MIN,
  PM25_RUIM,
  PROBABILIDADE_GUARDA_CHUVA_PCT,
} from './limiares';
import {
  alagamentoMaisProximo,
  chegadas,
  emMinutos,
  horasFuturas,
  maiorChanceDeChuva,
  noPonto,
  picoDeChuva,
} from './leituras';
import { observacao } from './observacao';
import { formatarDuracao, textoAtraso, transitoPesado } from './transito';

/** seguir = faça isto; atencao = faça com cuidado; evitar = não faça / adie. */
export type TomAcao = 'seguir' | 'atencao' | 'evitar';

export type Recomendacao = {
  id: string;
  tom: TomAcao;
  icone: IconName;
  /** Verbo + dado + horário ("Pegue o 875A-10 das 08:20"). */
  titulo: string;
  /** Uma frase com o porquê. */
  texto: string;
};

export const TOM_DA_ACAO: Record<TomAcao, Tom> = { seguir: 'ok', atencao: 'atencao', evitar: 'erro' };

const ORDEM: Record<TomAcao, number> = { evitar: 0, atencao: 1, seguir: 2 };

/** Ação principal do herói: o que fazer e quando, em uma linha + o porquê em outra. */
export function acaoPrincipal(b: BriefingResponse, agora: number): { titulo: string; detalhe: string | null } {
  const principal = (sev: 'AGUARDAR' | 'ATENCAO') => b.motivos.find((m) => m.severidade === sev);
  switch (b.veredito) {
    case 'FAVORAVEL': {
      const bus = observacao(b, 'bus');
      const c = bus?.value ? chegadas(bus.value, agora)[0] : undefined;
      if (c?.horario && c.minutos !== null && c.minutos >= 0) {
        return { titulo: 'Saia agora', detalhe: `${c.letreiro} chega às ${horaSP(c.horario)} (${emMinutos(c.minutos)})` };
      }
      const clima = observacao(b, 'weather')?.value;
      if (clima) {
        const p = picoDeChuva(clima, agora);
        return {
          titulo: 'Saia agora',
          detalhe:
            p.mm === 0
              ? 'Sem chuva prevista nas próximas 2 h'
              : `Chuva fraca: até ${decimal(p.mm)} mm/h nas próximas 2 h`,
        };
      }
      return { titulo: 'Saia agora', detalhe: 'Nenhum risco nas fontes que responderam' };
    }
    case 'ATENCAO':
      return { titulo: 'Saia com atenção', detalhe: principal('ATENCAO')?.texto ?? null };
    case 'AGUARDAR': {
      const m = principal('AGUARDAR');
      const porTempo = b.motivos
        .filter((x) => x.severidade === 'AGUARDAR')
        .every((x) => x.dimensao === 'weather' || x.dimensao === 'flood');
      if (porTempo && b.janelaMeteorologica) {
        return { titulo: `Espere até ${horaSP(b.janelaMeteorologica.inicio)}`, detalhe: m?.texto ?? null };
      }
      if (m?.dimensao === 'rail') return { titulo: 'Aguarde ou mude o caminho', detalhe: m.texto };
      return { titulo: porTempo ? 'Adie a saída' : 'Aguarde antes de sair', detalhe: m?.texto ?? null };
    }
    case 'INDETERMINADO': {
      const fora = b.observacoes.filter((o) => o.status === 'unavailable');
      if (fora.length === 0) {
        return { titulo: 'Sem dados para decidir', detalhe: 'Nenhuma fonte trouxe dado utilizável. Tente de novo em instantes' };
      }
      const nomes = fora.map((o) => NOME[o.dimension]);
      return {
        titulo: 'Sem dados para decidir',
        detalhe: `${juntar(nomes)} sem dados: ${primeiraMinuscula(explicarMotivo(fora[0].source, fora[0].motivo))}. Tente de novo em instantes`,
      };
    }
  }
}

const NOME = { weather: 'Clima', air: 'Ar', bus: 'Ônibus', rail: 'Metrô e trem', flood: 'Alagamento', traffic: 'Trânsito' } as const;

/** Nomes de fonte ("SPTrans", "Open-Meteo") ficam como estão; frases começam minúsculas. */
function primeiraMinuscula(s: string): string {
  return /^[A-ZÀ-Ú][a-zà-ú]/.test(s) && !/^(Open|SPTrans|GeoSampa|Direto|ARTESP|OSRM|Nominatim|TomTom|Simulação)/.test(s)
    ? s.charAt(0).toLowerCase() + s.slice(1)
    : s;
}

/** "A, B e C" */
export function juntar(itens: string[]): string {
  if (itens.length <= 1) return itens.join('');
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

function recomendacoesOnibus(b: BriefingResponse, agora: number): Recomendacao[] {
  const obs = observacao(b, 'bus');
  if (!obs?.value) return [];
  const ponto = noPonto(obs.value);
  const lista = chegadas(obs.value, agora);
  const comHorario = lista.filter((c) => c.horario !== null && c.minutos !== null && c.minutos >= 0);
  const idade = obs.status === 'stale' && obs.observedAt ? ` Previsão de ${haQuantoTempo(obs.observedAt, agora)}.` : '';
  const recs: Recomendacao[] = [];

  const [melhor, segunda] = comHorario;
  if (melhor) {
    const mais = lista.length > 1 ? ` É a mais próxima das ${lista.length} linhas vinculadas.` : '';
    if (melhor.minutos! > ONIBUS_DEMORANDO_MIN) {
      recs.push({
        id: `onibus-${melhor.codigoLinha}`,
        tom: 'atencao',
        icone: 'onibus',
        titulo: `Saia perto das ${horaSP(melhor.horario!)}: ${melhor.letreiro} só ${emMinutos(melhor.minutos!)}`,
        texto: `Espera acima de ${ONIBUS_DEMORANDO_MIN} min ${ponto}.${mais}${idade}`,
      });
    } else {
      recs.push({
        id: `onibus-${melhor.codigoLinha}`,
        tom: 'seguir',
        icone: 'onibus',
        titulo: `Pegue o ${melhor.letreiro} das ${horaSP(melhor.horario!)}`,
        texto: `Chega ${emMinutos(melhor.minutos!)} ${ponto}.${mais}${idade}`,
      });
    }
    if (segunda) {
      recs.push({
        id: `onibus-alt-${segunda.codigoLinha}`,
        tom: 'seguir',
        icone: 'alternativa',
        titulo: `Alternativa: ${segunda.letreiro} às ${horaSP(segunda.horario!)}`,
        texto: `Mesmo ponto, ${segunda.minutos! - melhor.minutos!} min depois do ${melhor.letreiro}.`,
      });
    }
  }
  const vencida = lista.find((c) => c.minutos !== null && c.minutos < 0);
  if (!melhor && vencida) {
    recs.push({
      id: `onibus-vencida-${vencida.codigoLinha}`,
      tom: 'atencao',
      icone: 'atualizar',
      titulo: `Atualize: a previsão do ${vencida.letreiro} (${horaSP(vencida.horario!)}) já passou`,
      texto: 'O briefing salvo é anterior à chegada prevista.',
    });
  }
  for (const c of lista.filter((x) => x.minutos === null)) {
    recs.push({
      id: `onibus-sem-${c.codigoLinha}`,
      tom: 'atencao',
      icone: 'onibus',
      titulo: `Confira o ${c.letreiro} no ponto`,
      texto:
        c.veiculos === 0
          ? 'Nenhum veículo da linha está transmitindo posição; sem horário previsto.'
          : 'A SPTrans não deu horário de chegada para esta linha.',
    });
  }
  return recs;
}

const COM_PROBLEMA: RailSituation[] = ['PARALISADA', 'ALTERADA'];

function recomendacoesTrilho(b: BriefingResponse): Recomendacao[] {
  const linhas = observacao(b, 'rail')?.value?.linhas ?? [];
  if (linhas.length === 0) return [];
  const normais = linhas.filter((l) => l.situacao === 'NORMAL');
  const problemas = linhas.filter((l) => COM_PROBLEMA.includes(l.situacao));
  if (problemas.length === 0) {
    if (normais.length !== linhas.length) return [];
    return [
      {
        id: 'trilho-normal',
        tom: 'seguir',
        icone: 'metro',
        titulo: normais.length === 1 ? `${nomeLinhaTrilho(normais[0].linha)} operando normalmente` : 'Metrô e trem operando normalmente',
        texto:
          normais.length === 1
            ? situacaoDaLinha(normais[0])
            : `${juntar(normais.map((l) => `Linha ${l.linha.slice(1)}`))} sem alteração segundo ${juntar([...new Set(normais.map((l) => nomeDaFonte(l.fonte)))])}.`,
      },
    ];
  }
  return problemas.map((l) => {
    const alternativa = normais[0];
    const nome = nomeLinhaTrilho(l.linha);
    const detalhe = detalheDaLinha(l);
    return {
      id: `trilho-${l.linha}`,
      tom: l.situacao === 'PARALISADA' ? ('evitar' as const) : ('atencao' as const),
      icone: alternativa ? ('alternativa' as const) : ('metro' as const),
      titulo: l.situacao === 'PARALISADA' ? `Evite a ${nome}` : `Conte com atraso na ${nome}`,
      texto: alternativa
        ? `${detalhe ? `${detalhe} ` : ''}${nomeLinhaTrilho(alternativa.linha)}, também do seu trajeto, opera normalmente.`
        : `${situacaoDaLinha(l)} Confirme ${canaisOficiais(l.linha)} antes de sair.`,
    };
  });
}

function recomendacoesChuva(b: BriefingResponse, agora: number): Recomendacao[] {
  const clima = observacao(b, 'weather')?.value;
  if (!clima) return [];
  const p = picoDeChuva(clima, agora);
  const quando = p.hora ? `às ${horaSP(p.hora)}` : 'agora';
  const janela = b.janelaMeteorologica;
  if (p.mm > CHUVA_FORTE_MM) {
    return [
      {
        id: 'chuva',
        tom: 'evitar',
        icone: 'guardaChuva',
        titulo: `Evite sair com a chuva forte ${quando}`,
        texto: janela
          ? `${decimal(p.mm)} mm/h previstos. Tempo firme a partir das ${horaSP(janela.inicio)}.`
          : `${decimal(p.mm)} mm/h previstos e nenhuma hora firme nas próximas 6 h.`,
      },
    ];
  }
  if (p.mm > CHUVA_MODERADA_MM) {
    return [
      {
        id: 'chuva',
        tom: 'atencao',
        icone: 'guardaChuva',
        titulo: 'Leve guarda-chuva',
        texto: `Chuva moderada de ${decimal(p.mm)} mm/h ${quando}; conte com trânsito mais lento.`,
      },
    ];
  }
  const chance = maiorChanceDeChuva(clima, agora);
  if (chance && chance.pct >= PROBABILIDADE_GUARDA_CHUVA_PCT) {
    return [
      {
        id: 'chuva',
        tom: 'atencao',
        icone: 'guardaChuva',
        titulo: 'Leve guarda-chuva',
        texto: `${chance.pct}% de chance de chuva às ${horaSP(chance.hora)} (até ${decimal(p.mm)} mm/h).`,
      },
    ];
  }
  const ultima = horasFuturas(clima, agora)[1] ?? horasFuturas(clima, agora)[0];
  return [
    {
      id: 'chuva',
      tom: 'seguir',
      icone: 'ceuLimpo',
      titulo: ultima ? `Sem chuva relevante até ${horaSP(ultima.hora)}` : 'Sem chuva relevante agora',
      texto: `Até ${decimal(p.mm)} mm/h${chance ? ` e ${chance.pct}% de chance` : ''} nas próximas 2 h.`,
    },
  ];
}

function recomendacoesAlagamento(b: BriefingResponse, agora: number): Recomendacao[] {
  const flood = observacao(b, 'flood')?.value;
  const d = flood ? alagamentoMaisProximo(flood) : null;
  if (!flood || d === null) return [];
  const local = flood.pontos.find((p) => Math.round(p.distanciaM) === d)?.local;
  const onde = local ? ` (${local})` : '';
  const clima = observacao(b, 'weather')?.value;
  const p = clima ? picoDeChuva(clima, agora) : null;
  if (p && p.mm > CHUVA_MODERADA_MM) {
    return [
      {
        id: 'alagamento',
        tom: 'evitar',
        icone: 'alagamento',
        titulo: `Não atravesse áreas alagadas a ${d} m do trajeto`,
        texto: `Ponto histórico de alagamento${onde} com chuva de ${decimal(p.mm)} mm/h prevista.`,
      },
    ];
  }
  return [
    {
      id: 'alagamento',
      tom: 'atencao',
      icone: 'alagamento',
      titulo: `Trecho com histórico de alagamento a ${d} m`,
      texto: `Sem chuva acima de ${decimal(CHUVA_MODERADA_MM)} mm/h prevista${onde}; evite o trecho se começar a chover.`,
    },
  ];
}

function recomendacoesAr(b: BriefingResponse): Recomendacao[] {
  const ar = observacao(b, 'air')?.value;
  if (!ar || ar.pm25Media24h === null || ar.pm25Media24h <= PM25_RUIM) return [];
  return [
    {
      id: 'ar',
      tom: 'atencao',
      icone: 'saude',
      titulo: 'Evite esforço físico ao ar livre',
      texto: `MP2,5 com média de ${decimal(ar.pm25Media24h)} µg/m³ em 24 h (estimativa de modelo). Crianças, idosos e quem tem doença respiratória: atenção redobrada.`,
    },
  ];
}

function recomendacoesTransito(b: BriefingResponse): Recomendacao[] {
  const t = observacao(b, 'traffic')?.value;
  if (!t || !transitoPesado(t)) return [];
  return [
    {
      id: 'transito',
      tom: 'atencao',
      icone: 'rota',
      titulo: `Conte com ${textoAtraso(t)} de trânsito`,
      texto: `O trecho de carro ou ônibus leva ${formatarDuracao(t.duracaoAtualS)} agora; sem trânsito, ${formatarDuracao(t.duracaoLivreS)} (TomTom). Se puder, prefira metrô ou trem.`,
    },
  ];
}

/** Todas as ações, da mais urgente à mais tranquila (evitar → atenção → seguir). */
export function recomendacoes(b: BriefingResponse, agora: number): Recomendacao[] {
  return [
    ...recomendacoesOnibus(b, agora),
    ...recomendacoesTrilho(b),
    ...recomendacoesTransito(b),
    ...recomendacoesChuva(b, agora),
    ...recomendacoesAlagamento(b, agora),
    ...recomendacoesAr(b),
  ].sort((x, y) => ORDEM[x.tom] - ORDEM[y.tom]);
}
