// Alertas calculados ao vivo (lógica pura) a partir do último briefing e do tempo agora.
// Limiares da B.8 já usados pelas regras RN01–RN07 (chuva 2,5/7,6 mm/h nas próximas 2 h;
// MP2,5 > 50 µg/m³ média 24 h; ônibus > 20 min ou sem previsão; trilho ALTERADA/PARALISADA;
// alagamento ≤ 300 m com chuva > 2,5) + umidade (Defesa Civil SP) e UV (OMS), em features/tempo/faixas.ts.
// Níveis: 0 informativo · 1 atenção · 2 alerta · 3 crítico. Ordenados do mais grave.
import type { BriefingResponse, WeatherValue } from '@kairos/contracts';

import type { IconName } from '@/components/icon';
import { situacaoDaLinha } from '@/features/briefing/explicar-fonte';
import { decimal, horaSP } from '@/features/briefing/format';
import {
  CHUVA_FORTE_MM,
  CHUVA_MODERADA_MM,
  ONIBUS_DEMORANDO_MIN,
  PM25_RUIM,
} from '@/features/briefing/limiares';
import { NIVEL_TRANSITO, temposDoTransito, textoAtraso, transitoPesado } from '@/features/briefing/transito';
import { faixaUmidade, faixaUv } from '@/features/tempo/faixas';
import { canaisOficiais } from '@/features/trajetos/linhas-trilho';
import type { Tom } from '@/theme';

export { CHUVA_FORTE_MM, CHUVA_MODERADA_MM, ONIBUS_DEMORANDO_MIN, PM25_RUIM };

export type NivelAlerta = 0 | 1 | 2 | 3;

export type AlertaCalculado = {
  id: string;
  nivel: NivelAlerta;
  titulo: string;
  /** Com os números reais ("9,1 mm/h às 09:00"). */
  resumo: string;
  conselho: string;
};

// Mesma escala de tons do veredito: nível 1–2 = cor de Atenção, 3 = cor de Aguardar.
export const NIVEL: Record<NivelAlerta, { rotulo: string; tom: Tom; icone: IconName }> = {
  0: { rotulo: 'Informativo', tom: 'neutro', icone: 'info' },
  1: { rotulo: 'Atenção', tom: 'atencao', icone: 'atencao' },
  2: { rotulo: 'Alerta', tom: 'atencao', icone: 'atencao' },
  3: { rotulo: 'Crítico', tom: 'erro', icone: 'aguardar' },
};

function observacao<D extends BriefingResponse['observacoes'][number]['dimension']>(
  briefing: BriefingResponse | undefined,
  dimension: D
) {
  return briefing?.observacoes.find(
    (o): o is Extract<BriefingResponse['observacoes'][number], { dimension: D }> =>
      o.dimension === dimension
  );
}

/** Pior chuva entre agora e as próximas 2 horas (janela da RN01/RN02). */
function piorChuva(clima: WeatherValue): { mm: number; quando: string } {
  const candidatos = [
    { mm: clima.atual.precipitacaoMm, quando: 'agora' },
    ...clima.horas.slice(0, 2).map((h) => ({ mm: h.precipitacaoMm, quando: `às ${horaSP(h.hora)}` })),
  ];
  return candidatos.reduce((a, b) => (b.mm > a.mm ? b : a));
}

export function avaliarAlertas(
  briefing: BriefingResponse | undefined,
  tempoAgora: WeatherValue | null | undefined
): AlertaCalculado[] {
  const alertas: AlertaCalculado[] = [];
  const clima = observacao(briefing, 'weather')?.value ?? tempoAgora ?? null;
  const chuva = clima ? piorChuva(clima) : null;

  if (chuva && chuva.mm > CHUVA_FORTE_MM) {
    alertas.push({
      id: 'chuva',
      nivel: 3,
      titulo: 'Chuva forte',
      resumo: `${decimal(chuva.mm)} mm/h ${chuva.quando}`,
      conselho:
        'Melhor aguardar: evite deslocamentos, não se abrigue sob árvores e fique longe de córregos.',
    });
  } else if (chuva && chuva.mm > CHUVA_MODERADA_MM) {
    alertas.push({
      id: 'chuva',
      nivel: 2,
      titulo: 'Chuva moderada',
      resumo: `${decimal(chuva.mm)} mm/h ${chuva.quando}`,
      conselho: 'Leve guarda-chuva e conte com trânsito mais lento.',
    });
  }

  const flood = observacao(briefing, 'flood')?.value;
  if (flood && flood.pontos.length > 0) {
    const n = flood.pontos.length;
    const maisProximo = Math.round(Math.min(...flood.pontos.map((p) => p.distanciaM)));
    const pontos = `${n} ${n === 1 ? 'ponto histórico' : 'pontos históricos'} a até ${flood.raioM} m; o mais próximo a ${maisProximo} m`;
    if (chuva && chuva.mm > CHUVA_MODERADA_MM) {
      alertas.push({
        id: 'alagamento',
        nivel: 3,
        titulo: 'Alagamento possível',
        resumo: `${pontos}, com chuva de ${decimal(chuva.mm)} mm/h ${chuva.quando}`,
        conselho: 'Não atravesse ruas alagadas, a pé ou de carro; considere outro caminho.',
      });
    } else {
      alertas.push({
        id: 'alagamento',
        nivel: 0,
        titulo: 'Pontos de alagamento no trajeto',
        resumo: `${pontos}, sem chuva acima de ${decimal(CHUVA_MODERADA_MM)} mm/h prevista`,
        conselho: 'Risco baixo agora; fique atento se o tempo mudar.',
      });
    }
  }

  const ar = observacao(briefing, 'air')?.value;
  if (ar && ar.pm25Media24h !== null && ar.pm25Media24h > PM25_RUIM) {
    alertas.push({
      id: 'ar',
      nivel: 2,
      titulo: 'Ar ruim para respirar',
      resumo: `MP2,5 ${decimal(ar.pm25Media24h)} µg/m³ média 24 h (estimativa de modelo)`,
      conselho:
        'Reduza esforço físico ao ar livre; atenção redobrada a crianças, idosos e quem tem doença respiratória.',
    });
  }

  for (const l of observacao(briefing, 'rail')?.value?.linhas ?? []) {
    if (l.situacao !== 'PARALISADA' && l.situacao !== 'ALTERADA') continue;
    const numero = l.linha.slice(1);
    alertas.push({
      id: `trilho-${l.linha}`,
      nivel: l.situacao === 'PARALISADA' ? 3 : 2,
      titulo:
        l.situacao === 'PARALISADA' ? `Linha ${numero} paralisada` : `Linha ${numero} com operação alterada`,
      // Texto da fonte + explicação da operadora (ex.: trecho com maiores intervalos), sem paráfrase.
      resumo: situacaoDaLinha(l),
      conselho: `Confirme ${canaisOficiais(l.linha)} e considere um caminho alternativo.`,
    });
  }

  for (const l of observacao(briefing, 'bus')?.value?.linhas ?? []) {
    if (l.minutosAteChegada === null) {
      alertas.push({
        id: `onibus-${l.codigoLinha}`,
        nivel: 2,
        titulo: `Ônibus ${l.letreiro} sem previsão`,
        resumo:
          l.veiculos === 0
            ? 'Nenhum veículo transmitindo posição'
            : `${l.veiculos} ${l.veiculos === 1 ? 'veículo transmitindo' : 'veículos transmitindo'}, sem horário`,
        conselho: 'Sem previsão não significa sem ônibus; confira no ponto ou use outra linha.',
      });
    } else if (l.minutosAteChegada > ONIBUS_DEMORANDO_MIN) {
      alertas.push({
        id: `onibus-${l.codigoLinha}`,
        nivel: 2,
        titulo: `Ônibus ${l.letreiro} demorando`,
        resumo: `chega em ${l.minutosAteChegada} min`,
        conselho: 'Considere outra linha cadastrada ou sair um pouco mais tarde.',
      });
    }
  }

  // RN09: só o trânsito que pesa no veredito vira alerta (atenção; parado = alerta).
  const transito = observacao(briefing, 'traffic')?.value;
  if (transito && transitoPesado(transito)) {
    alertas.push({
      id: 'transito',
      nivel: transito.nivel === 'PARADO' ? 2 : 1,
      titulo: `Trânsito ${NIVEL_TRANSITO[transito.nivel].rotulo.toLowerCase()} no trajeto`,
      resumo: `${textoAtraso(transito)}: ${temposDoTransito(transito)}`,
      conselho: 'Saia mais cedo ou prefira metrô e trem; de ônibus, conte com o atraso.',
    });
  }

  const umidade = clima?.atual.umidadePct ?? null;
  const faixaU = umidade === null ? null : faixaUmidade(umidade);
  if (faixaU) {
    alertas.push({
      id: 'umidade',
      nivel: faixaU.nivel,
      titulo: `Umidade baixa (${faixaU.rotulo})`,
      resumo: `Umidade relativa ${decimal(umidade!, 0)} %`,
      conselho: 'Beba água, evite exercícios ao ar livre entre 10 h e 16 h e umidifique ambientes.',
    });
  }

  const uv = clima?.atual.uv ?? null;
  const faixaV = uv === null ? null : faixaUv(uv);
  if (faixaV && faixaV.nivel >= 1) {
    alertas.push({
      id: 'uv',
      nivel: faixaV.nivel,
      titulo: `UV ${faixaV.rotulo}`,
      resumo: `Índice UV ${decimal(uv!)}`,
      conselho: 'Use protetor solar e chapéu; procure sombra entre 10 h e 16 h.',
    });
  }

  return alertas.sort((a, b) => b.nivel - a.nivel);
}

/** Tema do cartão "Saiba mais" (alertas-conteudo.ts) de cada alerta calculado. */
export function temaDoAlerta(id: string): string {
  if (id.startsWith('trilho-')) return 'trilhos';
  if (id.startsWith('onibus-')) return 'onibus';
  return id;
}

/** Maior nível ativo por tema, para o destaque do "Saiba mais" seguir o nível real. */
export function nivelPorTema(alertas: readonly AlertaCalculado[]): Record<string, NivelAlerta> {
  const r: Record<string, NivelAlerta> = {};
  for (const a of alertas) {
    const t = temaDoAlerta(a.id);
    if (r[t] === undefined || a.nivel > r[t]) r[t] = a.nivel;
  }
  return r;
}

/** Contagem do selo da aba Alertas: só nível ≥ 2. */
export function contarParaSelo(alertas: readonly AlertaCalculado[]): number {
  return alertas.filter((a) => a.nivel >= 2).length;
}

/**
 * Props do selo da aba. Defeito visto no aparelho (13/10): o selo mostrava "0" porque o
 * NativeTabs só respeita `hidden` quando o Badge NÃO tem texto. Com 0, vai sem texto e oculto.
 */
export function seloDaAba(contagem: number): { hidden: boolean; texto: string | undefined } {
  return contagem > 0 ? { hidden: false, texto: String(contagem) } : { hidden: true, texto: undefined };
}

/** Resumo do topo da aba Alertas: conta os de risco E os informativos (nunca "tudo tranquilo" com aviso na tela). */
export function resumoAlertas(alertas: readonly AlertaCalculado[]): {
  titulo: string;
  texto: string;
  tom: Tom;
} {
  const risco = alertas.filter((a) => a.nivel >= 1);
  const informativos = alertas.filter((a) => a.nivel === 0).length;
  const avisos = informativos === 1 ? '1 aviso informativo' : `${informativos} avisos informativos`;
  if (risco.length === 0) {
    return informativos === 0
      ? { titulo: 'Sem alertas agora', texto: 'Nada de risco no seu trajeto nem no tempo agora.', tom: 'ok' }
      : { titulo: `Sem alertas de risco · ${avisos}`, texto: `Veja abaixo: ${alertas[0].titulo.toLowerCase()}.`, tom: 'neutro' };
  }
  const pior = risco[0];
  return {
    titulo: `${risco.length} ${risco.length === 1 ? 'alerta ativo' : 'alertas ativos'}${informativos ? ` · ${avisos}` : ''}`,
    texto: `Mais importante agora: ${pior.titulo} (${pior.resumo}).`,
    tom: pior.nivel === 3 ? 'erro' : 'atencao',
  };
}
