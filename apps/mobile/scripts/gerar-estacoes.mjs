#!/usr/bin/env node
// Gera src/features/itinerario/dados/estacoes.json (itinerário das linhas de trilho, pedido de 14/10/2026).
//
// Fontes (nada inventado; cada linha do JSON registra a sua):
//   - Nomes e ORDEM das linhas 4–9: API Trilhos da ARTESP (`estacoes.nomes`), lida do fixture real
//     spikes/artesp/fixture-status.json — o script NÃO chama a ARTESP (orçamento de 12 req/h).
//   - Nomes e ORDEM das linhas 1, 2, 3 e 15: página oficial "Linhas e Estações" do Metrô.
//   - Coordenadas: GeoSampa WFS (estacao_metro, estacao_trem; estacao_metro_projetada só para
//     estações que ainda não estão na camada de operação), pedidas já em EPSG:4326.
//   - Conferência da ordem: projeção das estações na geometria de linha_metro (linhas 1–5 e 15).
//
// Uso (de apps/mobile):
//   node scripts/gerar-estacoes.mjs                 baixa as fontes (5 requisições)
//   node scripts/gerar-estacoes.mjs --de <pasta>    lê <camada>.json e metro-linhas-estacoes.html já baixados
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  distanciaM,
  normalizarNome,
  ordenarPelaPolilinha,
} from '../src/features/itinerario/geometria.ts';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SAIDA = path.join(AQUI, '../src/features/itinerario/dados/estacoes.json');
const FIXTURE_ARTESP = path.join(AQUI, '../../../spikes/artesp/fixture-status.json');
const USER_AGENT = 'Kairos-APS/0.1 (projeto academico; itinerario das linhas)';
const WFS =
  'http://wfs.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/wfs?service=WFS&version=2.0.0' +
  '&request=GetFeature&outputFormat=application/json&srsName=EPSG:4326&typeNames=geoportal:';
const METRO_URL = 'https://www.metro.sp.gov.br/sua-viagem/linhas-estacoes/';
const DECRETO_MARISTELA =
  'https://www.al.sp.gov.br/repositorio/legislacao/decreto/2024/decreto-68607-15.06.2024.html';

/**
 * Nome na fonte da ordem → nome no GeoSampa, quando a grafia difere além do que a normalização e a
 * regra de "todas as palavras do GeoSampa estão no nome oficial" resolvem. Cada entrada foi conferida
 * à mão (mesma linha, posição coerente na sequência).
 */
const ALIAS_GEOSAMPA = {
  'S. N. Sra. de Fátima-Sumaré': 'SANTUÁRIO NOSSA SENHORA DE FÁTIMA-SUMARÉ',
  'Vila Lobos-Jaguaré': 'VILLA-LOBOS - JAGUARÉ',
  'Domingos de Moraes': 'DOMINGOS DE MORAIS',
  // Decreto estadual 68.607/2024 renomeou a estação Vila Cardoso (projeto) para Maristela.
  Maristela: 'VILA CARDOSO',
};

const COR_GEOSAMPA = { L4: 'AMARELA', L5: 'LILAS', L6: 'LARANJA', L15: 'PRATA' };

// ---------- funções puras (testadas em test/scripts/gerar-estacoes.test.ts) ----------

/** Lista oficial do Metrô: { '1': [...nomes em ordem], '2': [...], ... } a partir do HTML. */
export function extrairEstacoesMetro(html) {
  // Um bloco do acordeão por linha; o link de uma estação de integração aponta para a página da
  // OUTRA linha (Ana Rosa na Linha 2 → linha-1-azul/...), por isso a linha vem do cabeçalho do bloco.
  const porLinha = {};
  for (const bloco of html.split('<div class="accordion-item').slice(1)) {
    const n = /Linha (\d+)-/.exec(bloco)?.[1];
    const nomes = [
      ...bloco.matchAll(/<li>\s*<a href="[^"]*\/estacao-[^"]*">([\s\S]*?)<\/a>\s*<\/li>/g),
    ].map(([, bruto]) =>
      decodificar(bruto.replace(/<[^>]+>/g, ''))
        .replace(/\s+/g, ' ')
        .trim()
    );
    if (n && nomes.length) porLinha[n] = nomes;
  }
  return porLinha;
}

function decodificar(s) {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'");
}

/**
 * Casa um nome da fonte da ordem com UMA feição do GeoSampa da mesma linha.
 * 1) alias conferido; 2) nome normalizado igual; 3) todas as palavras do nome do GeoSampa estão no
 * nome oficial (nomes com patrocínio: "Penha-Lojas Besni" ⊃ "PENHA"), desde que só um candidato sirva.
 * Devolve { feicao, casamento } ou null.
 */
export function casarEstacao(nome, feicoes) {
  const alvo = ALIAS_GEOSAMPA[nome];
  if (alvo) {
    const f = feicoes.find((x) => normalizarNome(x.nome) === normalizarNome(alvo));
    return f ? { feicao: f, casamento: 'alias' } : null;
  }
  const chave = normalizarNome(nome);
  const exato = feicoes.find((x) => normalizarNome(x.nome) === chave);
  if (exato) return { feicao: exato, casamento: 'exato' };
  const palavras = new Set(chave.split(' '));
  const candidatos = feicoes.filter((x) =>
    normalizarNome(x.nome)
      .split(' ')
      .every((p) => palavras.has(p))
  );
  return candidatos.length === 1 ? { feicao: candidatos[0], casamento: 'palavras' } : null;
}

/** Feições de estação do GeoSampa → { nome, linha, coordenada }, sem duplicatas (mesmo nome e linha). */
export function feicoesDeEstacao(colecao, camada) {
  const vistas = new Map();
  for (const f of colecao.features) {
    const p = f.properties;
    const [lon, lat] = f.geometry.coordinates;
    const linha = p.cd_identificador_linha != null ? `L${p.cd_identificador_linha}` : null;
    const item = {
      nome: p.nm_estacao_metro_trem,
      linha,
      cor: p.nm_linha_metro_trem,
      coordenada: { lat: arred(lat), lon: arred(lon) },
      camada,
    };
    const chave = `${linha ?? item.cor}|${normalizarNome(item.nome)}`;
    const anterior = vistas.get(chave);
    // Duplicata na fonte (ex.: VILA MARIANA 2× na Linha 1): só aceita se for o mesmo lugar.
    if (anterior && distanciaM(anterior.coordenada, item.coordenada) > 300) {
      throw new Error(`${camada}: "${item.nome}" repetida em lugares diferentes`);
    }
    if (!anterior) vistas.set(chave, item);
  }
  return [...vistas.values()];
}

const arred = (g) => Math.round(g * 1e6) / 1e6;

/** Compara a ordem da fonte com a ordem pela geometria (aceita a geometria no sentido inverso). */
export function conferirOrdem(nomesNaOrdem, comCoordenada, polilinha) {
  const pelaLinha = ordenarPelaPolilinha(comCoordenada, polilinha).map((e) => e.nome);
  const esperado = nomesNaOrdem.filter((n) => pelaLinha.includes(n));
  const igual = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  if (igual(pelaLinha, esperado) || igual([...pelaLinha].reverse(), esperado)) return 'confere';
  return `diverge: geometria = ${pelaLinha.join(' > ')}`;
}

// ---------- execução ----------

async function obter(nome, url, pasta) {
  if (pasta) return readFile(path.join(pasta, nome), 'utf8');
  const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.text();
}

async function principal() {
  const i = process.argv.indexOf('--de');
  const pasta = i > 0 ? process.argv[i + 1] : null;
  // Data em São Paulo (UTC−3 fixo, sem horário de verão desde 2019).
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

  const camada = async (n) => JSON.parse(await obter(`${n}.json`, WFS + n, pasta));
  const [metroEst, trensEst, projetadas, linhasMetro] = await Promise.all([
    camada('estacao_metro'),
    camada('estacao_trem'),
    camada('estacao_metro_projetada'),
    camada('linha_metro'),
  ]);
  const html = await obter('metro-linhas-estacoes.html', METRO_URL, pasta);
  const artesp = JSON.parse(await readFile(FIXTURE_ARTESP, 'utf8'));

  const operando = [
    ...feicoesDeEstacao(metroEst, 'estacao_metro'),
    ...feicoesDeEstacao(trensEst, 'estacao_trem'),
  ];
  const proj = feicoesDeEstacao(projetadas, 'estacao_metro_projetada');

  /** @type {{linha: string, nomes: string[], fonte: object}[]} */
  const ordens = [];
  const oficiais = extrairEstacoesMetro(html);
  for (const n of ['1', '2', '3', '15']) {
    if (!oficiais[n]?.length) throw new Error(`página do Metrô sem estações da linha ${n}`);
    ordens.push({
      linha: `L${n}`,
      nomes: oficiais[n],
      fonte: { nome: 'Metrô de São Paulo — Linhas e Estações', url: METRO_URL, consultadoEm: hoje },
    });
  }
  for (const emp of artesp.empresas) {
    for (const l of emp.linhas) {
      ordens.push({
        linha: `L${l.codigo}`,
        nomes: l.estacoes.nomes,
        fonte: {
          nome: `ARTESP API Trilhos (/status/, estacoes.nomes) — operadora ${emp.nome}`,
          url: 'https://ccm.artesp.sp.gov.br/metroferroviario/api/status/',
          consultadoEm: artesp.meta.timestamp.slice(0, 10),
          arquivo: 'spikes/artesp/fixture-status.json',
        },
      });
      if (l.estacoes.total !== l.estacoes.nomes.length)
        throw new Error(`L${l.codigo}: total ≠ nomes`);
    }
  }
  ordens.sort((a, b) => Number(a.linha.slice(1)) - Number(b.linha.slice(1)));

  const linhas = {};
  const relatorio = [];
  for (const { linha, nomes, fonte } of ordens) {
    const naLinha = operando.filter((f) => f.linha === linha);
    const projNaLinha = proj.filter((f) => f.cor === COR_GEOSAMPA[linha]);
    const estacoes = nomes.map((nome) => {
      const achou = casarEstacao(nome, naLinha) ?? casarEstacao(nome, projNaLinha);
      const deProjeto = achou?.feicao.camada === 'estacao_metro_projetada';
      if (!achou) relatorio.push(`${linha}: sem coordenada para "${nome}"`);
      else if (achou.casamento !== 'exato' || deProjeto)
        relatorio.push(
          `${linha}: "${nome}" ← GeoSampa "${achou.feicao.nome}" (${achou.casamento}, ${achou.feicao.camada})`
        );
      return {
        nome,
        coordenada: achou?.feicao.coordenada ?? null,
        ...(deProjeto ? { coordenadaDeProjeto: true } : {}),
      };
    });
    const geom = linhasMetro.features.find(
      (f) => `L${f.properties.cd_identificador_linha}` === linha
    );
    const comCoord = estacoes.filter((e) => e.coordenada);
    const ordem = geom
      ? conferirOrdem(
          nomes,
          comCoord,
          geom.geometry.coordinates.map(([lon, lat]) => ({ lat, lon }))
        )
      : 'sem geometria para conferir';
    relatorio.push(
      `${linha}: ${nomes.length} estações, ${comCoord.length} com coordenada, ordem ${ordem}`
    );
    linhas[linha] = {
      fonteOrdem: fonte,
      fonteCoordenadas: {
        nome: 'GeoSampa WFS (estacao_metro, estacao_trem, estacao_metro_projetada)',
        url: 'http://wfs.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/wfs',
        consultadoEm: hoje,
      },
      ordemConferidaNaGeometria: ordem,
      estacoes,
    };
  }

  const saida = {
    geradoPor: 'apps/mobile/scripts/gerar-estacoes.mjs',
    geradoEm: hoje,
    observacao:
      'Ordem = a da fonte (1º item = um terminal, último = o outro). coordenada null = não encontrada no ' +
      'GeoSampa. coordenadaDeProjeto = ponto da camada estacao_metro_projetada (estação ausente da camada ' +
      `de operação). Maristela = Vila Cardoso no projeto (decreto 68.607/2024: ${DECRETO_MARISTELA}).`,
    linhas,
  };
  await writeFile(SAIDA, JSON.stringify(saida, null, 1) + '\n', 'utf8');
  console.log(relatorio.join('\n'));
  console.log(`gravado: ${path.relative(process.cwd(), SAIDA)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  principal().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
