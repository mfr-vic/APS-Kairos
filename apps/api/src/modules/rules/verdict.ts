// RulesEngine: veredito e motivos a partir das observações do briefing (RF11, RN01–RN09). T24.
// Função pura: recebe `agora`; não lê relógio nem faz I/O.
import type { Observation, Reason, Severity, TrajetoRequest, Verdict } from '@kairos/contracts';
import { ROTULO_FAIXA_AR, classificarFaixaAr } from './air-quality.js';
import {
  decimalPtBr,
  estaIndisponivel,
  horaSaoPaulo,
  horasNoHorizonte,
  observacaoDe,
  valorUtilizavel,
} from './helpers.js';
import { ROTULO_NIVEL_TRANSITO } from './traffic.js';
import {
  ATRASO_TRANSITO_RN09_MIN,
  CHUVA_FRACA_MAX_MM_H,
  CHUVA_MODERADA_MAX_MM_H,
  ESPERA_ONIBUS_MAX_MIN,
  HORIZONTE_CHUVA_H,
  PM25_24H_RN05_UG_M3,
  RAIO_ALAGAMENTO_M,
} from './thresholds.js';

// Só as vinculações importam para as regras (RN06, RN07, RN08)
export type TrajetoVinculos = Pick<TrajetoRequest, 'onibus' | 'trilhos'>;

export interface ResultadoVeredito {
  veredito: Verdict;
  motivos: Reason[];
}

const PESO_SEVERIDADE: Record<Severity, number> = { AGUARDAR: 2, ATENCAO: 1, INFORMATIVO: 0 };

export function calcularVeredito(
  observacoes: readonly Observation[],
  trajeto: TrajetoVinculos,
  agora: Date,
): ResultadoVeredito {
  const motivos: Reason[] = [
    ...regrasChuva(observacoes, agora),
    ...regrasAlagamento(observacoes, agora),
    ...regraAr(observacoes),
    ...regraTrilhos(observacoes, trajeto),
    ...regraOnibus(observacoes, trajeto),
    ...regraTransito(observacoes, trajeto),
  ];
  // Ordem estável: AGUARDAR, depois ATENÇÃO, depois INFORMATIVO (mantém a ordem das regras)
  motivos.sort((a, b) => PESO_SEVERIDADE[b.severidade] - PESO_SEVERIDADE[a.severidade]);

  return { veredito: agregarVeredito(observacoes, trajeto, motivos), motivos };
}

// bus se houver linha de ônibus vinculada; rail se houver linha de trilho vinculada (B.8)
export function dimensoesTransporteVinculadas(trajeto: TrajetoVinculos): ('bus' | 'rail')[] {
  return [
    ...(trajeto.onibus.length > 0 ? (['bus'] as const) : []),
    ...(trajeto.trilhos.length > 0 ? (['rail'] as const) : []),
  ];
}

// RN08: agregação. INDETERMINADO se o clima estiver unavailable e todas as dimensões de
// transporte vinculadas também (sem transporte vinculado, basta o clima). INFORMATIVO não conta.
export function agregarVeredito(
  observacoes: readonly Observation[],
  trajeto: TrajetoVinculos,
  motivos: readonly Reason[],
): Verdict {
  const climaIndisponivel = estaIndisponivel(observacaoDe(observacoes, 'weather'));
  const dimensoesTransporte = dimensoesTransporteVinculadas(trajeto);
  const transporteIndisponivel = dimensoesTransporte.every((d) =>
    estaIndisponivel(observacaoDe(observacoes, d)),
  );
  if (climaIndisponivel && transporteIndisponivel) return 'INDETERMINADO';

  if (motivos.some((m) => m.severidade === 'AGUARDAR')) return 'AGUARDAR';
  if (motivos.some((m) => m.severidade === 'ATENCAO')) return 'ATENCAO';
  return 'FAVORAVEL';
}

// RN01 (chuva forte → AGUARDAR) e RN02 (chuva moderada → ATENÇÃO), sobre o maior valor
// horário com carimbo em (agora, agora + 2 h]. São mutuamente exclusivas.
function regrasChuva(observacoes: readonly Observation[], agora: Date): Reason[] {
  const clima = valorUtilizavel(observacaoDe(observacoes, 'weather'));
  if (!clima) return [];
  const pico = maiorPrecipitacao(horasNoHorizonte(clima, agora, HORIZONTE_CHUVA_H));
  if (!pico) return [];

  const detalhe = `${decimalPtBr(pico.precipitacaoMm)} mm/h às ${horaSaoPaulo(pico.horaMs)}`;
  if (pico.precipitacaoMm > CHUVA_MODERADA_MAX_MM_H) {
    return [{ dimensao: 'weather', severidade: 'AGUARDAR', regra: 'RN01', texto: `Chuva forte prevista (${detalhe})` }];
  }
  if (pico.precipitacaoMm > CHUVA_FRACA_MAX_MM_H) {
    return [{ dimensao: 'weather', severidade: 'ATENCAO', regra: 'RN02', texto: `Chuva moderada prevista (${detalhe})` }];
  }
  return [];
}

// RN03 (alagamento ≤ 300 m + chuva > 2,5 mm/h nas próximas 2 h → AGUARDAR) e
// RN04 (alagamento ≤ 300 m sem essa chuva → INFORMATIVO).
function regrasAlagamento(observacoes: readonly Observation[], agora: Date): Reason[] {
  const alagamento = valorUtilizavel(observacaoDe(observacoes, 'flood'));
  if (!alagamento) return [];
  const proximos = alagamento.pontos
    .filter((p) => p.distanciaM <= RAIO_ALAGAMENTO_M)
    .sort((a, b) => a.distanciaM - b.distanciaM);
  const maisProximo = proximos[0];
  if (!maisProximo) return [];

  const distancia = `${Math.round(maisProximo.distanciaM)} m`;
  const pontos =
    proximos.length === 1
      ? `Ponto histórico de alagamento a ${distancia} do trajeto`
      : `${proximos.length} pontos históricos de alagamento a até ${RAIO_ALAGAMENTO_M} m do trajeto (o mais próximo a ${distancia})`;

  // Clima unavailable: não dá para afirmar chuva, então fica só o aviso INFORMATIVO (RN04)
  const clima = valorUtilizavel(observacaoDe(observacoes, 'weather'));
  const pico = clima ? maiorPrecipitacao(horasNoHorizonte(clima, agora, HORIZONTE_CHUVA_H)) : null;
  const limite = decimalPtBr(CHUVA_FRACA_MAX_MM_H);

  if (pico && pico.precipitacaoMm > CHUVA_FRACA_MAX_MM_H) {
    return [
      {
        dimensao: 'flood',
        severidade: 'AGUARDAR',
        regra: 'RN03',
        texto: `${pontos}, com chuva acima de ${limite} mm/h prevista nas próximas ${HORIZONTE_CHUVA_H} h`,
      },
    ];
  }
  const complemento = clima
    ? `sem chuva acima de ${limite} mm/h prevista nas próximas ${HORIZONTE_CHUVA_H} h`
    : 'previsão de chuva indisponível';
  return [{ dimensao: 'flood', severidade: 'INFORMATIVO', regra: 'RN04', texto: `${pontos}; ${complemento}` }];
}

// RN05: média de 24 h de MP2,5 > 50 µg/m³ → ATENÇÃO. Média null (sem 24 h de dados) não gera motivo.
function regraAr(observacoes: readonly Observation[]): Reason[] {
  const ar = valorUtilizavel(observacaoDe(observacoes, 'air'));
  if (!ar || ar.pm25Media24h === null || !(ar.pm25Media24h > PM25_24H_RN05_UG_M3)) return [];
  const faixa = classificarFaixaAr(ar.pm25Media24h);
  const rotulo = faixa ? ROTULO_FAIXA_AR[faixa] : 'ruim';
  return [
    {
      dimensao: 'air',
      severidade: 'ATENCAO',
      regra: 'RN05',
      texto: `Qualidade do ar ${rotulo} (MP2,5 média de 24 h: ${decimalPtBr(ar.pm25Media24h)} µg/m³, estimativa de modelo)`,
    },
  ];
}

// RN05 ativa? Usada também pela janela meteorológica (RF14)
export function rn05Ativa(observacoes: readonly Observation[]): boolean {
  return regraAr(observacoes).length > 0;
}

// RN06: linha de trilho vinculada com situação ≠ NORMAL → ATENÇÃO; PARALISADA → AGUARDAR.
// DESCONHECIDA e linha ausente na resposta = sem dado para a linha → não gera motivo.
function regraTrilhos(observacoes: readonly Observation[], trajeto: TrajetoVinculos): Reason[] {
  if (trajeto.trilhos.length === 0) return [];
  const trilhos = valorUtilizavel(observacaoDe(observacoes, 'rail'));
  if (!trilhos) return [];

  const motivos: Reason[] = [];
  for (const codigo of trajeto.trilhos) {
    const linha = trilhos.linhas.find((l) => l.linha === codigo);
    if (!linha) continue;
    const nome = `Linha ${codigo.slice(1)}`;
    const fonte = linha.statusTexto.trim() ? ` ("${linha.statusTexto.trim()}")` : '';
    if (linha.situacao === 'PARALISADA') {
      motivos.push({ dimensao: 'rail', severidade: 'AGUARDAR', regra: 'RN06', texto: `${nome} paralisada${fonte}` });
    } else if (linha.situacao === 'ALTERADA') {
      motivos.push({ dimensao: 'rail', severidade: 'ATENCAO', regra: 'RN06', texto: `${nome} com operação alterada${fonte}` });
    }
  }
  return motivos;
}

// RN07: para cada linha de ônibus vinculada, minutosAteChegada > 20 ou null → ATENÇÃO.
// Linha vinculada ausente na previsão da parada = sem previsão (null).
function regraOnibus(observacoes: readonly Observation[], trajeto: TrajetoVinculos): Reason[] {
  if (trajeto.onibus.length === 0) return [];
  const onibus = valorUtilizavel(observacaoDe(observacoes, 'bus'));
  if (!onibus) return [];

  const motivos: Reason[] = [];
  for (const vinculo of trajeto.onibus) {
    const chegada = onibus.linhas.find((l) => l.codigoLinha === vinculo.codigoLinha);
    const minutos = chegada?.minutosAteChegada ?? null;
    if (minutos === null) {
      motivos.push({
        dimensao: 'bus',
        severidade: 'ATENCAO',
        regra: 'RN07',
        texto: `Ônibus ${vinculo.letreiro} sem previsão de chegada`,
      });
    } else if (minutos > ESPERA_ONIBUS_MAX_MIN) {
      motivos.push({
        dimensao: 'bus',
        severidade: 'ATENCAO',
        regra: 'RN07',
        texto: `Ônibus ${vinculo.letreiro}: próxima chegada em ${minutos} min`,
      });
    }
  }
  return motivos;
}

// RN09 (decisão de projeto, 14/10/2026): atraso por trânsito ≥ 15 min OU nível INTENSO/PARADO.
// Com ônibus vinculado → ATENÇÃO (o ônibus anda no mesmo trânsito); sem ônibus → INFORMATIVO (trilhos e
// a pé não sofrem o trânsito; o aviso fica para quem for de carro/app).
function regraTransito(observacoes: readonly Observation[], trajeto: TrajetoVinculos): Reason[] {
  const transito = valorUtilizavel(observacaoDe(observacoes, 'traffic'));
  if (!transito) return [];
  const atrasoMin = Math.round(transito.atrasoS / 60);
  const pesado = transito.nivel === 'INTENSO' || transito.nivel === 'PARADO';
  if (!pesado && transito.atrasoS < ATRASO_TRANSITO_RN09_MIN * 60) return [];
  const atraso = atrasoMin > 0 ? `, ${atrasoMin} min de atraso` : '';
  const texto = `Trânsito ${ROTULO_NIVEL_TRANSITO[transito.nivel]} no trajeto${atraso}`;
  const comOnibus = trajeto.onibus.length > 0;
  return [
    {
      dimensao: 'traffic',
      severidade: comOnibus ? 'ATENCAO' : 'INFORMATIVO',
      regra: 'RN09',
      texto: comOnibus ? `${texto}; o ônibus pega o mesmo trânsito` : texto,
    },
  ];
}

function maiorPrecipitacao<T extends { precipitacaoMm: number }>(horas: readonly T[]): T | null {
  let pico: T | null = null;
  for (const h of horas) {
    if (!pico || h.precipitacaoMm > pico.precipitacaoMm) pico = h;
  }
  return pico;
}
