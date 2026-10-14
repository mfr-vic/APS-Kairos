// Tabela WMO weather_code (Open-Meteo, 0–99) → descrição curta em pt-BR + ícone da família
// de components/icon.tsx (SF Symbols no iOS, Material Symbols no Android/web).
import type { WeatherValue } from '@kairos/contracts';

import type { IconName } from '@/components/icon';

export type CondicaoTempo = { descricao: string; icone: IconName };

const TABELA: [codigos: number[], condicao: CondicaoTempo][] = [
  [[0], { descricao: 'Céu limpo', icone: 'ceuLimpo' }],
  [[1], { descricao: 'Quase limpo', icone: 'ceuLimpo' }],
  [[2], { descricao: 'Parcialmente nublado', icone: 'parcialNublado' }],
  [[3], { descricao: 'Nublado', icone: 'nublado' }],
  [[45, 48], { descricao: 'Nevoeiro', icone: 'nevoeiro' }],
  [[51, 53, 55, 56, 57], { descricao: 'Garoa', icone: 'garoa' }],
  [[61, 66], { descricao: 'Chuva fraca', icone: 'clima' }],
  [[63, 67], { descricao: 'Chuva moderada', icone: 'clima' }],
  [[65], { descricao: 'Chuva forte', icone: 'clima' }],
  [[71, 73, 75, 77, 85, 86], { descricao: 'Neve', icone: 'neve' }],
  [[80, 81], { descricao: 'Pancadas de chuva', icone: 'pancadas' }],
  [[82], { descricao: 'Pancadas fortes', icone: 'pancadas' }],
  [[95], { descricao: 'Tempestade', icone: 'tempestade' }],
  [[96, 99], { descricao: 'Tempestade com granizo', icone: 'granizo' }],
];

/** null para código ausente ou fora da tabela. */
export function condicaoDoCodigo(codigo: number | null | undefined): CondicaoTempo | null {
  if (codigo === null || codigo === undefined) return null;
  return TABELA.find(([codigos]) => codigos.includes(codigo))?.[1] ?? null;
}

type Hora = Pick<WeatherValue['horas'][number], 'precipitacaoMm' | 'probabilidadePrecipitacao'>;

// shortcut: a previsão horária do contrato não traz weather_code; o ícone por hora vem da
// chuva prevista. Trocar por um código por hora se o contrato passar a informá-lo.
export function iconeDaHora(h: Hora): IconName {
  if (h.precipitacaoMm >= 2.5) return 'pancadas';
  if (h.precipitacaoMm >= 0.5) return 'clima';
  if (h.precipitacaoMm > 0 || (h.probabilidadePrecipitacao ?? 0) >= 40) return 'garoa';
  return 'parcialNublado';
}
