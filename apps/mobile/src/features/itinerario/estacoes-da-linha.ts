// Estações de cada linha de trilho, na ordem da fonte (gerado por scripts/gerar-estacoes.mjs;
// fontes e datas ficam no próprio JSON). Dado estático: não consulta nada em tempo de execução.
import type { RailLine } from '@kairos/contracts';

import dados from './dados/estacoes.json';
import type { Estacao } from './montar-itinerario';

export type Fonte = { nome: string; url: string; consultadoEm: string };

export type DadosLinha = {
  fonteOrdem: Fonte;
  fonteCoordenadas: Fonte;
  estacoes: Estacao[];
};

const LINHAS = dados.linhas as Partial<Record<RailLine, DadosLinha>>;

/** null = linha sem itinerário (CPTM 10–13 hoje). */
export function estacoesDaLinha(linha: RailLine): DadosLinha | null {
  return LINHAS[linha] ?? null;
}
