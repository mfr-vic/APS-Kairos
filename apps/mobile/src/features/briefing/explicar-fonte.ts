// Fonte indisponível ou desatualizada explicada em linguagem humana (função pura).
// A API devolve motivos genéricos ("A fonte não respondeu a tempo"); aqui a fonte ganha nome
// ("SPTrans não respondeu a tempo") e o jargão vira o que a pessoa precisa saber.
import type { Dimension, RailValue } from '@kairos/contracts';

import { operadoraLinhaTrilho } from '@/features/trajetos/linhas-trilho';

const NOME_FONTE: Record<string, string> = {
  'open-meteo': 'Open-Meteo',
  'open-meteo-air-quality': 'Open-Meteo (CAMS)',
  'sptrans-olhovivo': 'SPTrans',
  'metro-sp': 'Direto do Metrô',
  geosampa: 'GeoSampa',
  artesp: 'ARTESP',
  osrm: 'OSRM',
  nominatim: 'Nominatim',
  tomtom: 'TomTom',
};

/** Nome curto da fonte para a pessoa; simulados ficam marcados como simulação. */
export function nomeDaFonte(source: string): string {
  if (source.startsWith('simulado:')) return `Simulação de ${nomeDaFonte(source.slice(9))}`;
  // Trilhos podem vir de duas fontes no mesmo briefing ("artesp+metro-sp", contrato 1.3.0).
  if (source.includes('+')) return source.split('+').map(nomeDaFonte).join(' e ');
  return NOME_FONTE[source] ?? source;
}

/** Dimensão em minúsculas para frases ("o ônibus", "o metrô e o trem"). */
export const DIMENSAO_NA_FRASE: Record<Dimension, string> = {
  weather: 'a chuva',
  air: 'o ar',
  bus: 'o ônibus',
  rail: 'o metrô e o trem',
  flood: 'o alagamento',
  traffic: 'o trânsito',
};

type LinhaTrilho = RailValue['linhas'][number];

/**
 * Quem informou a situação desta linha: "ARTESP · ViaMobilidade 8 e 9", "Direto do Metrô".
 * `fonte` é por linha desde o contrato 1.3.0 (um trajeto mistura ARTESP e a página do Metrô).
 */
export function fonteDaLinha(l: Pick<LinhaTrilho, 'linha' | 'fonte'>): string {
  const nome = nomeDaFonte(l.fonte);
  const op = l.fonte.replace(/^simulado:/, '') === 'artesp' ? operadoraLinhaTrilho(l.linha) : null;
  return op ? `${nome} · ${op}` : nome;
}

/** Explicação da operadora (ARTESP `descricao`) com ponto final; null se não houver. */
export function detalheDaLinha(l: Pick<LinhaTrilho, 'detalhe'>): string | null {
  const d = l.detalhe?.trim();
  if (!d) return null;
  return /[.!?]$/.test(d) ? d : `${d}.`;
}

/**
 * Situação da linha com a fonte e a explicação da operadora, sem inventar nada:
 * 'ARTESP · ViaMobilidade 8 e 9: “Maiores Intervalos”. Devido à atividade…'.
 */
export function situacaoDaLinha(
  l: Pick<LinhaTrilho, 'linha' | 'fonte' | 'statusTexto' | 'detalhe'>
): string {
  const status = l.statusTexto.trim();
  const base = status ? `${fonteDaLinha(l)}: “${status}”.` : `${fonteDaLinha(l)}: sem texto da fonte.`;
  const detalhe = detalheDaLinha(l);
  return detalhe ? `${base} ${detalhe}` : base;
}

type Regra = [RegExp, (nome: string, m: RegExpMatchArray) => string];

const REGRAS: Regra[] = [
  [/^A fonte não respondeu a tempo/i, (n) => `${n} não respondeu a tempo`],
  [
    /^Prazo do briefing esgotado antes da resposta da fonte/i,
    (n) => `${n} não respondeu dentro do prazo do briefing`,
  ],
  [/^Falha de conexão com a fonte/i, (n) => `Sem conexão com ${n}`],
  [/^A fonte respondeu com erro \(HTTP (\d+)\)/i, (n, m) => `${n} respondeu com erro (HTTP ${m[1]})`],
  [/^A fonte respondeu em formato inesperado/i, (n) => `${n} respondeu num formato inesperado`],
  // A mensagem do breaker tem "; " no meio: a 2ª metade é descartada no split (ver abaixo).
  [
    /^Fonte com falhas repetidas/i,
    (n) => `${n} falhou várias vezes seguidas; o servidor tenta de novo em instantes`,
  ],
  [/^Limite de consultas à fonte atingido/i, (n) => `Limite de consultas a ${n} atingido`],
  [
    /^O último dado da fonte tem (.+?) e está antigo demais/i,
    (n, m) => `O último dado de ${n} tem ${m[1]} e está antigo demais`,
  ],
  [/^Dado da fonte com (.+?) de idade/i, (n, m) => `Dado de ${n} com ${m[1]} de idade`],
  [/não configurad[oa] no servidor/i, (n) => `${n} não está configurada neste servidor`],
  [
    /^Sem fonte configurada para a\(s\) linha\(s\) (.+)/i,
    (_n, m) => `Nenhuma fonte pública informa a situação de ${m[1]}`,
  ],
  [/^Erro inesperado ao consultar a fonte/i, (n) => `Falha inesperada ao consultar ${n}`],
  [/^Tempo limite de (\d+) s excedido/i, (n, m) => `${n} não respondeu em ${m[1]} s`],
  [/^Circuit breaker aberto/i, (n) => `${n} falhou várias vezes seguidas; o servidor tenta de novo em instantes`],
];

/**
 * Motivo da API reescrito com o nome da fonte. Partes separadas por "; " são tratadas uma a uma
 * ("A fonte não respondeu a tempo; usando dado de 2 min atrás" →
 *  "SPTrans não respondeu a tempo; mostrando o dado de 2 min atrás"). Sem ponto final.
 */
export function explicarMotivo(source: string, motivo: string | undefined): string {
  const nome = nomeDaFonte(source);
  if (!motivo?.trim()) return `${nome} não enviou dados`;
  const partes = motivo
    .trim()
    .replace(/\.$/, '')
    .split(/;\s*/)
    .filter((parte) => !/^nova tentativa em instantes$/i.test(parte))
    .map((parte) => {
      const usando = parte.match(/^usando dado de (.+) atrás$/i);
      if (usando) return `mostrando o dado de ${usando[1]} atrás`;
      for (const [re, fazer] of REGRAS) {
        const m = parte.match(re);
        if (m) return fazer(nome, m);
      }
      return parte.replace(/\b(d?a) fonte\b/gi, (_t, art: string) =>
        art.toLowerCase() === 'da' ? `de ${nome}` : nome
      );
    });
  return partes.join('; ');
}
