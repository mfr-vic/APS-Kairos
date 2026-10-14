// Parser da página "Direto do Metrô" (T34, RF21). Função pura, sem dependências.
// Fonte: https://www.metro.sp.gov.br/wp-content/themes/metrosp/direto-metro.php?embed=1 (spike T06).
// Cada linha vem renderizada no servidor como:
//   <li class="linha list-group-item">
//     <div class="linha-numero" ...>1</div>
//     <div class="linha-nome">Azul</div>
//     <div class="linha-situacao" title="...">Operação Normal</div>
//     <div class="linha-info ..." data-bs-title="<div class='title' ...>Metrô</div>
//          <div class='description'>Situação Normal</div><div class='date'>(atualizado em 10/10/2026 21:01:03)</div>"
//          title="[Metrô] Situação Normal (atualizado em 10/10/2026 21:01:03)"></div>
//   </li>
// Se a marcação mudar a ponto de não reconhecermos nenhuma linha, lançamos SchemaValidationError:
// o ProviderRunner transforma isso em `unavailable` ("A fonte respondeu em formato inesperado").
import { RailLineSchema, type RailLine, type RailSituation } from '@kairos/contracts';
import { SchemaValidationError } from '../../infrastructure/errors.js';
import { truncar } from '../../infrastructure/http-client.js';

export interface LinhaDiretoMetro {
  linha: RailLine;
  /** Nome da linha na página, ex.: "Azul". */
  nome: string;
  /** Título do tooltip: operadora ("Metrô", "ViaQuatro"…) ou tipo de operação ("Operação Transitória"). */
  operadora: string | null;
  /** Texto curto da situação, como a página mostra (ex.: "Operação Normal"). */
  statusTexto: string;
  situacao: RailSituation;
  /** Descrição do tooltip, ex.: "Situação Normal". */
  descricao: string | null;
  /** "atualizado em" da página em ISO 8601 com -03:00; null se a página não trouxer. */
  atualizadoEm: string | null;
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Decodifica as entidades HTML que aparecem na página (nomeadas básicas e numéricas). */
export function decodificarEntidades(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entidade, corpo: string) => {
    if (corpo[0] === '#') {
      const codigo = corpo[1] === 'x' || corpo[1] === 'X' ? parseInt(corpo.slice(2), 16) : parseInt(corpo.slice(1), 10);
      return Number.isFinite(codigo) ? String.fromCodePoint(codigo) : entidade;
    }
    return ENTIDADES[corpo.toLowerCase()] ?? entidade;
  });
}

function limpar(texto: string): string {
  return decodificarEntidades(texto).replace(/\s+/g, ' ').trim();
}

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Normalização da RN06 (B.8): "Operação Normal" → NORMAL; texto com "paralisad" ou "encerrad" → PARALISADA
 * (decisão de 10/10/2026: linha fechada à noite não pode ser usada);
 * qualquer outro texto → ALTERADA. Comparação sem acento e sem diferenciar maiúsculas.
 */
export function normalizarSituacao(statusTexto: string): RailSituation {
  const t = semAcento(statusTexto).replace(/\s+/g, ' ').trim();
  if (t.includes('paralisad') || t.includes('encerrad')) return 'PARALISADA';
  if (t === 'operacao normal') return 'NORMAL';
  return 'ALTERADA';
}

/** "10/10/2026 21:01:03" ou "10/10/2026 21:01" (horário de SP, sem horário de verão desde 2019) → ISO -03:00. */
export function paraIsoSaoPaulo(dataHora: string): string | null {
  const m = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/.exec(dataHora);
  if (!m) return null;
  const [, dia, mes, ano, hora, minuto, segundo = '00'] = m;
  const iso = `${ano}-${mes}-${dia}T${hora}:${minuto}:${segundo}-03:00`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/** Conteúdo do primeiro elemento com a classe exata `classe` (aspas simples ou duplas). */
function conteudoDaClasse(html: string, classe: string): string | null {
  const re = new RegExp(`<(\\w+)[^>]*\\sclass=(["'])${classe}(?:\\s[^"']*)?\\2[^>]*>([\\s\\S]*?)</\\1>`, 'i');
  const m = re.exec(html);
  return m ? limpar(m[3]!.replace(/<[^>]*>/g, ' ')) : null;
}

/** Valor de um atributo (entre aspas duplas) no primeiro elemento com a classe `classe`. */
function atributoDaClasse(html: string, classe: string, atributo: string): string | null {
  // Varre as tags respeitando aspas: o data-bs-title tem "<" e ">" crus dentro das aspas duplas
  const tags = html.matchAll(/<\w+((?:\s+[^\s=>"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+))?)*)\s*\/?>/g);
  const classeRe = new RegExp(`\\sclass="${classe}(?:\\s[^"]*)?"`, 'i');
  const attrRe = new RegExp(`\\s${atributo}="([^"]*)"`, 'i');
  for (const tag of tags) {
    if (!classeRe.test(tag[1]!)) continue;
    const attr = attrRe.exec(tag[1]!);
    return attr ? decodificarEntidades(attr[1]!) : null;
  }
  return null;
}

function erroDeEstrutura(message: string, trecho: string): SchemaValidationError {
  return new SchemaValidationError([{ path: 'direto-metro', message }], truncar(trecho));
}

/**
 * HTML do "Direto do Metrô" → linhas reconhecidas pelo contrato (RailLineSchema).
 * Linhas que o contrato não conhece (ex.: 17-Ouro) são ignoradas.
 * Lança SchemaValidationError se nenhum bloco `<li class="linha ...">` for encontrado, se um bloco
 * não tiver número ou situação, ou se nenhuma linha do contrato aparecer (página mudou).
 */
export function parseDiretoMetro(html: string): LinhaDiretoMetro[] {
  const blocos = [...html.matchAll(/<li\b[^>]*\sclass="linha(?:\s[^"]*)?"[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1]!);
  if (blocos.length === 0) {
    throw erroDeEstrutura('nenhum bloco <li class="linha"> encontrado; a página mudou?', html.slice(0, 300));
  }

  const linhas: LinhaDiretoMetro[] = [];
  for (const bloco of blocos) {
    const numero = conteudoDaClasse(bloco, 'linha-numero');
    const statusTexto = conteudoDaClasse(bloco, 'linha-situacao');
    if (!numero || !statusTexto) {
      throw erroDeEstrutura('bloco de linha sem número ou sem situação; a página mudou?', bloco);
    }
    const linha = RailLineSchema.safeParse(`L${numero}`);
    if (!linha.success) continue; // ex.: Linha 17-Ouro, fora do contrato

    // O tooltip (data-bs-title) é HTML escapado dentro do atributo; o `title` é o mesmo texto em linha
    const tooltip = atributoDaClasse(bloco, 'linha-info', 'data-bs-title') ?? '';
    const titulo = atributoDaClasse(bloco, 'linha-info', 'title') ?? '';
    const data = /atualizado em\s*([^)]*)/i.exec(tooltip || titulo)?.[1] ?? null;

    linhas.push({
      linha: linha.data,
      nome: conteudoDaClasse(bloco, 'linha-nome') ?? '',
      operadora: conteudoDaClasse(tooltip, 'title'),
      statusTexto,
      situacao: normalizarSituacao(statusTexto),
      descricao: conteudoDaClasse(tooltip, 'description'),
      atualizadoEm: data ? paraIsoSaoPaulo(data) : null,
    });
  }

  if (linhas.length === 0) {
    throw erroDeEstrutura('nenhuma linha do contrato encontrada na página', blocos[0]!);
  }
  return linhas;
}
