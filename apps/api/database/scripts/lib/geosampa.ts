// Transformação pura do GeoJSON do WFS GeoSampa (camada geoportal:risco_ocorrencia_alagamento)
// em linhas para flood_points. O mapeamento foi definido no spike T07 (spikes/geosampa/NOTAS.md).
// A reprojeção 31983 → 4326 NÃO é feita aqui; ela é feita no PostGIS (ST_Transform) durante a importação.

import { createHash } from 'node:crypto';

export const FONTE_DATASET = 'geosampa_alagamento';
export const PREFIXO_SOURCE_ID = 'geosampa:alagamento:';
export const WFS_URL =
  'http://wfs.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/wfs?service=WFS&version=2.0.0' +
  '&request=GetFeature&typeNames=geoportal:risco_ocorrencia_alagamento&outputFormat=application/json';
export const USER_AGENT = 'Kairos-APS/0.1 (projeto academico; contato: mfr.vic@gmail.com)';

export interface LinhaAlagamento {
  sourceId: string;
  /** AAAA-MM-DD, ou null */
  ocorridoEm: string | null;
  /** A fonte não tem endereço; usa-se nm_subprefeitura como provisório (spike T07). */
  endereco: string | null;
  /** Coordenadas originais em EPSG:31983 (SIRGAS 2000 / UTM 23S). */
  x: number;
  y: number;
}

interface FeicaoWfs {
  id?: string;
  geometry: { type: string; coordinates: unknown } | null;
  properties: Record<string, unknown> | null;
}

interface ColecaoWfs {
  type?: string;
  crs?: { properties?: { name?: string } };
  numberMatched?: number;
  features?: FeicaoWfs[];
}

const DATA_ISO = /^(\d{4}-\d{2}-\d{2})Z?$/;

function textoOuNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/**
 * SHA-256 do CONTEÚDO (crs + features), e não do arquivo bruto. O WFS gera o arquivo na hora e
 * o campo `timeStamp` muda a cada requisição: em 10/10/2026, dois downloads seguidos tinham features
 * idênticas e só o timeStamp diferente, ou seja, hashes de arquivo diferentes. Com o hash do
 * conteúdo, baixar de novo dados iguais é reconhecido como "já importado".
 */
export function hashConteudo(texto: string): string {
  const fc = JSON.parse(texto) as ColecaoWfs;
  return createHash('sha256')
    .update(JSON.stringify({ crs: fc.crs ?? null, features: fc.features ?? null }))
    .digest('hex');
}

export function transformarGeoJson(texto: string): LinhaAlagamento[] {
  const fc = JSON.parse(texto) as ColecaoWfs;
  if (fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
    throw new Error('o arquivo não é uma FeatureCollection GeoJSON');
  }
  const crs = fc.crs?.properties?.name ?? '(sem crs)';
  if (!/EPSG::?31983$/.test(crs)) throw new Error(`CRS inesperado: ${crs} (esperado EPSG:31983)`);
  if (fc.numberMatched !== undefined && fc.numberMatched !== fc.features.length) {
    throw new Error(
      `numberMatched (${fc.numberMatched}) != features (${fc.features.length}): resposta paginada ou truncada`,
    );
  }

  const ids = new Set<string>();
  return fc.features.map((f, i) => {
    const p = f.properties ?? {};
    const id = textoOuNull(p.cd_identificador);
    if (!id) throw new Error(`feição ${i}: cd_identificador ausente`);
    if (ids.has(id)) throw new Error(`cd_identificador repetido na fonte: ${id}`);
    ids.add(id);

    const g = f.geometry;
    const coords = g?.coordinates;
    if (
      !g ||
      g.type !== 'Point' ||
      !Array.isArray(coords) ||
      !Number.isFinite(coords[0]) ||
      !Number.isFinite(coords[1])
    ) {
      throw new Error(`feição ${id}: geometria ausente ou não é Point`);
    }

    const dataBruta = textoOuNull(p.dt_ocorrencia);
    const data = dataBruta ? DATA_ISO.exec(dataBruta) : null;
    if (dataBruta && !data) throw new Error(`feição ${id}: dt_ocorrencia inesperada: ${dataBruta}`);

    return {
      sourceId: PREFIXO_SOURCE_ID + id,
      ocorridoEm: data ? data[1] : null,
      endereco: textoOuNull(p.nm_subprefeitura),
      x: coords[0] as number,
      y: coords[1] as number,
    };
  });
}
