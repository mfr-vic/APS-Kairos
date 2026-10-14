// Filtros de camadas da aba Mapa (pedido de 13/10): alagamento, chuva e temperatura, com valor e
// IMPACTO no veredito em linguagem do app. Os limiares vêm do servidor (B.8); aqui só se descreve.
import type { ImpactoMapa, MapaCamadasResponse } from '@kairos/contracts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import type { IconName } from '@/components/icon';
import { buscarCamadas, CHAVE_CAMADAS } from '@/shared/api/camadas';
import { statusColors, type Tom } from '@/theme';

export type CamadaMapa = 'alagamento' | 'chuva' | 'temperatura' | 'transito';

export const CAMADAS: readonly { id: CamadaMapa; rotulo: string; icone: IconName }[] = [
  { id: 'alagamento', rotulo: 'Alagamento', icone: 'alagamento' },
  { id: 'chuva', rotulo: 'Chuva', icone: 'gota' },
  { id: 'temperatura', rotulo: 'Temperatura', icone: 'termometro' },
  // RF22: tiles de fluxo da TomTom pelo proxy da API (a chave fica no servidor). Desligada por padrão: cota de tiles.
  { id: 'transito', rotulo: 'Trânsito', icone: 'rota' },
];

/** Cores do estilo de fluxo relativo da TomTom (legenda da camada Trânsito). */
export const LEGENDA_TRANSITO =
  'Ao vivo (© TomTom): verde = fluindo; laranja = lento; vermelho = congestionado; vermelho-escuro = parado ou bloqueado. No mapa é informativa; o trânsito do seu trajeto entra no veredito (RN09).';

/** Só alagamento, chuva e temperatura dependem de GET /v1/mapa/camadas (o trânsito vem em tiles). */
export const precisaDeCamadas = (filtros: readonly CamadaMapa[]) => filtros.some((f) => f !== 'transito');

export const CHAVE_FILTROS = 'kairos:mapa-camadas:v1';
export const FILTROS_PADRAO: CamadaMapa[] = ['alagamento', 'chuva'];

/** Lê o valor salvo; qualquer coisa inválida volta ao padrão. Mantém a ordem de CAMADAS. */
export function lerFiltros(raw: string | null): CamadaMapa[] {
  if (raw == null) return FILTROS_PADRAO;
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return FILTROS_PADRAO;
    return CAMADAS.map((c) => c.id).filter((id) => v.includes(id));
  } catch {
    return FILTROS_PADRAO;
  }
}

export function alternarFiltro(atuais: readonly CamadaMapa[], c: CamadaMapa): CamadaMapa[] {
  const ligado = atuais.includes(c);
  return CAMADAS.map((x) => x.id).filter((id) => (id === c ? !ligado : atuais.includes(id)));
}

/** Filtros com persistência (preferência por aparelho, como o tema). */
export function useFiltrosCamadas(): [CamadaMapa[], (c: CamadaMapa) => void] {
  const [filtros, setFiltros] = useState<CamadaMapa[]>(FILTROS_PADRAO);
  useEffect(() => {
    let ativo = true;
    AsyncStorage.getItem(CHAVE_FILTROS)
      .then((raw) => ativo && setFiltros(lerFiltros(raw)))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);
  function alternar(c: CamadaMapa) {
    setFiltros((atuais) => {
      const novos = alternarFiltro(atuais, c);
      AsyncStorage.setItem(CHAVE_FILTROS, JSON.stringify(novos)).catch(() => {});
      return novos;
    });
  }
  return [filtros, alternar];
}

export function useCamadasMapa(ativo: boolean) {
  return useQuery({
    queryKey: CHAVE_CAMADAS,
    queryFn: ({ signal }) => buscarCamadas(signal),
    enabled: ativo,
    staleTime: 5 * 60_000, // o servidor renova a cada 15 min (C.5)
  });
}

export const IMPACTO: Record<ImpactoMapa, { rotulo: string; tom: Tom }> = {
  NAO_PESA: { rotulo: 'Não pesa no veredito', tom: 'ok' },
  ATENCAO: { rotulo: 'Atenção no veredito', tom: 'atencao' },
  AGUARDAR: { rotulo: 'Aguardar no veredito', tom: 'erro' },
};

const COR_TOM: Record<Tom, string> = {
  ok: statusColors.favoravel,
  atencao: statusColors.atencao,
  erro: statusColors.aguardar,
  neutro: statusColors.indeterminado,
};

export const num1 = (n: number) => n.toFixed(1).replace('.', ',');
const hora = (iso: string | null) => (iso ? iso.slice(11, 16) : null);
const dataBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Um marcador já pronto para o Leaflet: `etiqueta` vazia = bolinha; `detalhe` = HTML escapado do toque. */
export type PontoCamada = {
  camada: CamadaMapa;
  lat: number;
  lon: number;
  etiqueta: string;
  cor: string;
  detalhe: string;
};

export function pontosDasCamadas(d: MapaCamadasResponse, filtros: readonly CamadaMapa[]): PontoCamada[] {
  const { chuvaAtencaoMmH: at, chuvaAguardarMmH: ag, raioAlagamentoM: raio } = d.limiares;
  const pontos: PontoCamada[] = [];
  if (filtros.includes('alagamento')) {
    for (const p of d.alagamento.pontos) {
      pontos.push({
        camada: 'alagamento',
        lat: p.lat,
        lon: p.lon,
        etiqueta: '',
        cor: statusColors.aguardar,
        detalhe: esc(
          `Alagamento registrado${p.ocorridoEm ? ` em ${dataBr(p.ocorridoEm)}` : ''}${p.local ? ` · ${p.local}` : ''}. ` +
            `Impacto: se o trajeto passa a até ${raio} m daqui e a chuva da próxima hora passar de ${num1(at)} mm/h, Aguardar (RN03).`
        ),
      });
    }
  }
  const h = hora(d.clima.horaPrevista);
  if (filtros.includes('chuva')) {
    for (const p of d.clima.pontos) {
      const imp = IMPACTO[p.impactoChuva];
      const regra = p.impactoChuva === 'AGUARDAR' ? ` (acima de ${num1(ag)} mm/h, RN01)` : p.impactoChuva === 'ATENCAO' ? ` (acima de ${num1(at)} mm/h, RN02)` : ` (até ${num1(at)} mm/h)`;
      pontos.push({
        camada: 'chuva',
        lat: p.lat,
        lon: p.lon,
        etiqueta: `${num1(p.chuvaProximaHoraMm)} mm/h`,
        cor: COR_TOM[imp.tom],
        detalhe: esc(
          `${p.regiao}: ${num1(p.chuvaProximaHoraMm)} mm/h previstos${h ? ` na hora até ${h}` : ''}` +
            `${p.probabilidadeChuva != null ? `, ${p.probabilidadeChuva}% de chance de chuva` : ''}. ${imp.rotulo}${regra}.`
        ),
      });
    }
  }
  if (filtros.includes('temperatura')) {
    for (const p of d.clima.pontos) {
      pontos.push({
        camada: 'temperatura',
        lat: p.lat,
        lon: p.lon,
        etiqueta: `${num1(p.temperaturaC)} °C`,
        cor: statusColors.indeterminado,
        detalhe: esc(`${p.regiao}: ${num1(p.temperaturaC)} °C agora. Informativa: a temperatura não pesa no veredito.`),
      });
    }
  }
  return pontos;
}

/** Linha da legenda (abaixo dos filtros) para uma camada ligada: valor de referência, impacto e estado da fonte. */
export function legendaDaCamada(c: CamadaMapa, d: MapaCamadasResponse | undefined): string {
  if (c === 'transito') return LEGENDA_TRANSITO;
  if (!d) return '';
  const fonte = c === 'alagamento' ? d.alagamento : d.clima;
  if (fonte.status === 'unavailable') return `Indisponível agora: ${fonte.motivo ?? 'fonte fora do ar'}.`;
  const velho = fonte.status === 'stale' ? ` Dados de ${hora(fonte.observedAt) ?? '—'} (desatualizados).` : '';
  const { chuvaAtencaoMmH: at, chuvaAguardarMmH: ag, raioAlagamentoM: raio } = d.limiares;
  switch (c) {
    case 'alagamento': {
      const n = d.alagamento.pontos.length;
      return `${n} ${n === 1 ? 'ponto histórico' : 'pontos históricos'} (GeoSampa). Trajeto a até ${raio} m de um ponto + chuva acima de ${num1(at)} mm/h = Aguardar.${velho}`;
    }
    case 'chuva':
      return `Próxima hora${hora(d.clima.horaPrevista) ? ` (até ${hora(d.clima.horaPrevista)})` : ''}: acima de ${num1(at)} mm/h = Atenção; acima de ${num1(ag)} mm/h = Aguardar.${velho}`;
    case 'temperatura':
      return `Agora, em ${d.clima.pontos.length} regiões da cidade. Informativa: não pesa no veredito.${velho}`;
  }
}
