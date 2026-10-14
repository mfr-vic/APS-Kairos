// Sinais curtos por dimensão (ícone + dado + tom) para os chips do herói e o "motivo principal"
// dos cartões de trajeto. Função pura: só afirma o que está no briefing.
import type { BriefingResponse, Dimension } from '@kairos/contracts';

import type { IconName } from '@/components/icon';
import type { Tom } from '@/theme';

import { decimal, FAIXA_AR, horaSP } from './format';
import { CHUVA_MODERADA_MM, ONIBUS_DEMORANDO_MIN, PM25_RUIM } from './limiares';
import { alagamentoMaisProximo, chegadas, emMinutos, picoDeChuva, tomDaChuva } from './leituras';
import { observacao } from './observacao';
import { atrasoMin, NIVEL_TRANSITO, textoAtraso, transitoPesado } from './transito';

export type Sinal = {
  dimensao: Dimension;
  tom: Tom;
  icone: IconName;
  /** Texto curto, cabe numa pílula ("875A-10 em 6 min", "Chuva forte às 09:00"). */
  texto: string;
};

export const ICONE_DIMENSAO: Record<Dimension, IconName> = {
  bus: 'onibus',
  rail: 'metro',
  weather: 'clima',
  air: 'ar',
  flood: 'alagamento',
  // shortcut: sem ícone de carro em components/icon.tsx (fora da posse desta frente); trocar por 'carro' quando existir
  traffic: 'rota',
};

const NOME_CURTO: Record<Dimension, string> = {
  bus: 'Ônibus',
  rail: 'Metrô e trem',
  weather: 'Chuva',
  air: 'Ar',
  flood: 'Alagamento',
  traffic: 'Trânsito',
};

const ORDEM_TOM: Record<Tom, number> = { erro: 0, atencao: 1, neutro: 2, ok: 3 };
const ORDEM_DIMENSAO: Dimension[] = ['bus', 'rail', 'traffic', 'weather', 'flood', 'air'];

function sinalDe(b: BriefingResponse, dim: Dimension, agora: number): Sinal | null {
  const obs = observacao(b, dim);
  if (!obs) return null;
  const icone = ICONE_DIMENSAO[dim];
  if (obs.status === 'unavailable' || obs.value === null) {
    return { dimensao: dim, tom: 'neutro', icone, texto: `${NOME_CURTO[dim]} sem dados` };
  }
  switch (obs.dimension) {
    case 'bus': {
      const c = chegadas(obs.value!, agora)[0];
      if (!c) return null;
      if (c.minutos === null) return { dimensao: dim, tom: 'atencao', icone, texto: `${c.letreiro} sem previsão` };
      if (c.minutos < 0) return { dimensao: dim, tom: 'neutro', icone, texto: `${c.letreiro}: previsão vencida` };
      return {
        dimensao: dim,
        tom: c.minutos > ONIBUS_DEMORANDO_MIN ? 'atencao' : 'ok',
        icone,
        texto: `${c.letreiro} ${emMinutos(c.minutos)}`,
      };
    }
    case 'rail': {
      const linhas = obs.value!.linhas;
      if (linhas.length === 0) return null;
      const n = (l: (typeof linhas)[number]) => `Linha ${l.linha.slice(1)}`;
      const parada = linhas.find((l) => l.situacao === 'PARALISADA');
      if (parada) return { dimensao: dim, tom: 'erro', icone, texto: `${n(parada)} paralisada` };
      const alterada = linhas.find((l) => l.situacao === 'ALTERADA');
      if (alterada) return { dimensao: dim, tom: 'atencao', icone, texto: `${n(alterada)} alterada` };
      const desconhecida = linhas.find((l) => l.situacao === 'DESCONHECIDA');
      if (desconhecida) return { dimensao: dim, tom: 'neutro', icone, texto: `${n(desconhecida)} sem status` };
      return {
        dimensao: dim,
        tom: 'ok',
        icone,
        texto: linhas.length === 1 ? `${n(linhas[0])} normal` : 'Linhas normais',
      };
    }
    case 'weather': {
      const p = picoDeChuva(obs.value!, agora);
      const tom = tomDaChuva(p.mm);
      const quando = p.hora ? `às ${horaSP(p.hora)}` : 'agora';
      if (tom === 'erro') return { dimensao: dim, tom, icone, texto: `Chuva forte ${quando}` };
      if (tom === 'atencao') return { dimensao: dim, tom, icone, texto: `Chuva de ${decimal(p.mm)} mm/h ${quando}` };
      return {
        dimensao: dim,
        tom: 'ok',
        icone: p.mm === 0 ? 'ceuLimpo' : 'garoa',
        texto: p.mm === 0 ? 'Sem chuva prevista' : `Chuva fraca (${decimal(p.mm)} mm/h)`,
      };
    }
    case 'air': {
      const a = obs.value!;
      if (a.pm25Media24h !== null && a.pm25Media24h > PM25_RUIM) {
        return { dimensao: dim, tom: 'atencao', icone, texto: `Ar ruim (${decimal(a.pm25Media24h, 0)} µg/m³)` };
      }
      if (a.faixa === null) return null;
      if (a.faixa === 'BOA') return { dimensao: dim, tom: 'ok', icone, texto: 'Ar bom' };
      if (a.faixa === 'MODERADA') return { dimensao: dim, tom: 'neutro', icone, texto: 'Ar moderado' };
      return { dimensao: dim, tom: 'atencao', icone, texto: `Ar ${FAIXA_AR[a.faixa].toLowerCase()}` };
    }
    case 'flood': {
      const d = alagamentoMaisProximo(obs.value!);
      if (d === null) return { dimensao: dim, tom: 'ok', icone, texto: 'Sem alagamento no caminho' };
      const clima = observacao(b, 'weather')?.value;
      const chove = clima ? picoDeChuva(clima, agora).mm > CHUVA_MODERADA_MM : false;
      return chove
        ? { dimensao: dim, tom: 'erro', icone, texto: `Alagamento a ${d} m` }
        : { dimensao: dim, tom: 'neutro', icone, texto: `Alagamento a ${d} m (histórico)` };
    }
    case 'traffic': {
      const t = obs.value!;
      if (atrasoMin(t) === 0) return { dimensao: dim, tom: 'ok', icone, texto: 'Trânsito livre' };
      return {
        dimensao: dim,
        tom: transitoPesado(t) ? 'atencao' : NIVEL_TRANSITO[t.nivel].tom,
        icone,
        texto: `Trânsito ${textoAtraso(t)}`,
      };
    }
  }
}

/** Sinais do mais grave ao mais tranquilo; empate segue a ordem ônibus → trilhos → chuva → alagamento → ar. */
export function sinaisDoBriefing(b: BriefingResponse, agora: number): Sinal[] {
  return ORDEM_DIMENSAO.map((d) => sinalDe(b, d, agora))
    .filter((s): s is Sinal => s !== null)
    .sort((a, b) => ORDEM_TOM[a.tom] - ORDEM_TOM[b.tom]);
}
