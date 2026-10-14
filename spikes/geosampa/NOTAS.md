# Spike T07: GeoSampa, alagamentos (dados de ocorrências)

Executado em 10/10/2026, das 08:05 às 08:23 (America/Sao_Paulo). Todos os números abaixo foram medidos nessa janela. Nada foi estimado.

## Critério de pronto da T07

| Item | Situação |
|---|---|
| Formato conhecido | Sim. WFS 2.0 do GeoServer; baixados GeoJSON e SHAPE-ZIP |
| Sistema de coordenadas conhecido | Sim. EPSG:31983 (SIRGAS 2000 / UTM 23S), confirmado em 3 lugares |
| Quantidade conhecida | Sim. 292 feições |
| Datas conhecidas | Sim. `dt_ocorrencia` vai de 2026-01-04 a 2026-09-28; carga em 2026-10-06 |
| Importação de teste feita | Sim. `spike_flood_raw` e `flood_points` |
| Contagem conferida | Sim. Fonte 292, `spike_flood_raw` 292 e `flood_points` 292 |
| Ponto conhecido localizado | Sim. Ocorrência 1458 cai na subprefeitura Vila Prudente, a mesma do registro |

**Resultado: critério atingido.** Há uma ressalva: a fonte **não tem endereço**, ver "Problemas".

## Origem dos dados

- Metadados: https://metadados.geosampa.prefeitura.sp.gov.br/geonetwork/srv/api/records/432c06b1-03a1-4b1f-9210-423e1b58e869 (HTTP 200, `dateStamp` 2026-10-06T17:16:23, `editionDate` 2024-05-08). A distribuição informada é "Postgis - OGC". Os links são WFS e WMS e não há arquivo para download direto.
- Camada WFS: `geoportal:risco_ocorrencia_alagamento`.
- URLs usadas, todas com User-Agent `Kairos-APS/0.1 (projeto academico; contato: mfr.vic@gmail.com)`:
  - Contagem (`resultType=hits`): `http://wfs.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=geoportal:risco_ocorrencia_alagamento&resultType=hits` retornou `numberMatched="292"`.
  - GeoJSON: a mesma URL com `&outputFormat=application/json`. HTTP 200, **111.512 bytes**, SHA-256 `6b5f4c4331002a75dba0e0e8820ee2336023787d622b094346147ecbae83e43e`.
  - Shapefile: a mesma URL com `&outputFormat=SHAPE-ZIP`. HTTP 200, **11.337 bytes**, SHA-256 `39c8ec764b5d9baf25753ec6a3e27e08b600415033809f5a266d316420ab745e`. Contém .shp, .shx, .dbf, .prj e .cst (`ISO-8859-1`).
  - Polígonos das subprefeituras, usados só para verificar o ponto: `...typeNames=geoportal:subprefeitura&outputFormat=application/json`. 2.941.322 bytes, SHA-256 `228065cb435296483fa1ef365d9eb3ae66561a60275786d3e8a44ce8b7148491`, 32 feições.
- Os arquivos brutos ficaram fora do repositório, em `%TEMP%\kairos-geosampa\`. São todos pequenos (menos de 3 MB).
- Formatos de saída que o WFS oferece: GeoJSON, SHAPE-ZIP, GeoPackage, CSV, KML e GML.

## Formato e sistema de coordenadas

- Geometria `Point`, campo `ge_ponto`. Nenhuma geometria nula.
- O SRID **31983** está confirmado em 3 lugares:
  - nos metadados: `SIRGAS2000 / UTM zone 23S (EPSG:31983)`;
  - no `.prj`: `AUTHORITY["EPSG","31983"]`;
  - no GeoJSON: `crs = urn:ogc:def:crs:EPSG::31983`.
- `ogrinfo` (imagem `ghcr.io/osgeo/gdal:alpine-small-latest`) no shapefile mostrou `Feature Count: 292` e extensão `(316414.10, 7364698.82) - (358672.95, 7408759.01)`.
- O PostGIS do `kairos-db` tem os SRIDs 31983 e 4326 em `spatial_ref_sys`. A transformação para 4326 é `ST_Transform`. No proj4, SIRGAS 2000 e WGS84 aparecem com towgs84=0, ou seja, são tratados como equivalentes (diferença menor que 1 m).
- `shp2pgsql` **não existe** no container `kairos-db`, porque a imagem postgis/postgis:16-3.4 não traz o binário. Por isso o script lê o GeoJSON com Node puro e monta o SQL.

## Campos e mapeamento para `flood_points`

| Campo na fonte (WFS / DBF) | Tipo | Observação medida | Destino em `flood_points` |
|---|---|---|---|
| `cd_identificador` / `cd_identif` | string | 292 valores distintos, nenhum nulo | `source_id` = `geosampa:alagamento:<cd_identificador>` |
| `dt_ocorrencia` / `dt_ocorren` | date (`"2026-04-01Z"`) | nenhum nulo | `occurred_on` (sem o `Z`) |
| `dc_tipo_ocorrencia` | string | sempre `ALAGAMENTO` | (não guardado) |
| `nm_distrito` | string | **nulo nas 292** | não serve |
| `nm_subprefeitura` | string | `"VP - VILA PRUDENTE"`, com caixa inconsistente (ver abaixo) | `address`, como provisório |
| `sg_fonte_original` | string | sempre `SIGRC` | (não guardado) |
| `dt_carga` | date | sempre `2026-10-06` | (não guardado) |
| `ge_ponto` | Point 31983 | — | `geom` = `ST_Transform(..., 4326)` |

## Quantidade e datas

- Total: 292 feições. Ocorrências de 2026-01-04 a 2026-09-28.
- Por mês: 2026-01 = 94, 02 = 34, 03 = 48, 04 = 5, 05 = 1, 06 = 10, 08 = 5, 09 = 95. Julho não tem nenhuma.
- Extensão em WGS84: lon de -46.7993 a -46.3841; lat de -23.8197 a -23.4213.
- Todas as **292 de 292** estão dentro do retângulo de SP (lat -24.01 a -23.35, lon -46.83 a -46.36).
- Há 264 coordenadas distintas na grade de 1 m. Ou seja, várias ocorrências se repetem no mesmo ponto em datas diferentes.

## Importação de teste

Comandos e saídas reais:

```
# 08:22:46 — carga em spike_flood_raw + fixture
node spikes/geosampa/import.mjs --file %TEMP%/kairos-geosampa/alag.json --keep-raw --fixture spikes/geosampa/fixture.json
Feições na fonte: 292 (numberMatched=292)
Linhas em spike_flood_raw: 292 (ids distintos 292); datas 2026-01-04 a 2026-09-28; dentro do retângulo de SP: 292
Contagem conferida: fonte = banco.

# ~08:12 — inserção de teste em flood_points + registro do hash, rodada duas vezes
node spikes/geosampa/import.mjs --file .../alag.json --to-flood-points --register
Linhas em flood_points (geosampa:alagamento:*): 292
(2ª execução) Hash já registrado em dataset_imports — nada a fazer (idempotente).
dataset_imports: geosampa_alagamento | 6b5f4c43…e83e43e | 292
flood_points: 1 | geosampa:alagamento:1458 | 2026-04-01 | VP - VILA PRUDENTE | POINT(-46.5368208 -23.6062164)
```

### Idempotência

- O script calcula o SHA-256 do arquivo.
- Com `--register`, ele procura `(source='geosampa_alagamento', file_hash)` em `dataset_imports`. Se encontrar, sai sem importar.
- Se não encontrar, ele roda tudo numa única transação:
  1. apaga de `flood_points` as linhas com `source_id LIKE 'geosampa:alagamento:%'`;
  2. insere o lote novo;
  3. grava o hash.
- Atenção: o WFS gera o arquivo na hora. Se a ordem das feições ou o `dt_carga` mudarem, o hash muda mesmo que os dados não tenham mudado. Nesse caso a reimportação substitui as linhas sem duplicar, porque usa delete e insert por prefixo. Para a T09 vale considerar um `UNIQUE (source_id)` em `flood_points`. Isso mudaria o schema, então fica para decisão do grupo e não foi feito aqui.

## Ponto conhecido verificado

A fonte não tem endereço. Por isso a verificação foi assim: carreguei os 32 polígonos oficiais de subprefeitura do próprio GeoSampa (`geoportal:subprefeitura`, em 31983) numa tabela temporária, `spike_subpref`, e testei `ST_Contains`.

- **Ocorrência 1458** (2026-04-01). O registro diz `VP - VILA PRUDENTE`. A coordenada UTM é `POINT(343203.497 7388527.454)` e, em WGS84, fica em **lon -46.536821, lat -23.606216**. O polígono que contém o ponto é **VP - VILA PRUDENTE**, o mesmo do registro, e o ponto está dentro do retângulo de SP.
- Em toda a base: as 292 de 292 caem dentro de alguma subprefeitura de SP. Em 283 de 292, a subprefeitura do polígono é a mesma do registro. Esse total já conta a ocorrência 393, em que o registro usa o código `G` e o polígono usa `GU` para Guaianases.
- As 9 que não batem, com a distância até a subprefeitura declarada:
  - perto da divisa, provavelmente borda ou vetorização: 1367 (4 m), 215 (33 m), 1166 (129 m), 2314 (486 m);
  - erro de atributo ou de coordenada na fonte: 356 (5,0 km), 2493 (23,6 km), 2414 (33,4 km), 2439 (33,4 km), 2663 (40,3 km).
- Isso não muda o uso previsto, que é a proximidade do ponto. Mas mostra que o rótulo de subprefeitura não é confiável como "endereço".

## Problemas encontrados

1. **Não há campo de endereço.** O `nm_distrito` está nulo em todas as linhas, então o único rótulo é `nm_subprefeitura`. Como provisório, `address` recebe a subprefeitura. Se for preciso um endereço legível, há duas saídas: geocodificação reversa (Nominatim, que é de outro spike e tem limite de 1 req/s) ou o polígono de distrito (`geoportal:distrito_municipal`).
2. **O WFS só traz 2026.** Os metadados dizem que "Dados dos anos anteriores (desde 2013) permanecem disponíveis para download", mas o link para isso não aparece nos metadados. Não procurei além disso. Os anos anteriores, se o grupo quiser, ficam como pendência no portal geosampa.prefeitura.sp.gov.br.
3. A caixa de `nm_subprefeitura` é inconsistente (`MP - SAO MIGUEL PAULISTA` e `MP - Sao Miguel Paulista`) e há um código fora do padrão (`G` em vez de `GU`). É preciso normalizar pela sigla antes do `' - '`.
4. Há uma concentração em `MP - SAO MIGUEL PAULISTA`: 106 + 7 = 113 das 292 ocorrências. Isso foi medido, a causa não foi investigada.
5. O `shp2pgsql` não está no container, e o `ogr2ogr` exige `docker run` da imagem GDAL. O caminho em Node puro com GeoJSON evitou os dois.
6. O `.dbf` usa ISO-8859-1. O GeoJSON vem em UTF-8 e não tem esse problema.

## Plano B (GeoJSON + Turf)

O formato é bom, então o plano B não é necessário. Se o PostGIS ficar fora do caminho, o fluxo seria:

1. pedir o WFS com `&srsName=EPSG:4326` (o GeoServer reprojeta);
2. guardar o GeoJSON, que tem cerca de 110 KB;
3. fazer a proximidade com `@turf/distance` ou `@turf/nearest-point` em memória.

Com 292 pontos o custo é desprezível. Esse caminho não foi testado.

## Arquivos

- `import.mjs`: importação de teste reproduzível em Node 24 puro. Opções: `--file`, `--to-flood-points`, `--register`, `--fixture`, `--cleanup`, `--keep-raw`. Sem `--file`, baixa do WFS para `%TEMP%`.
- `fixture.json`: 5 feições reais (ids 19, 28, 30, 65, 72) já em WGS84, transformadas pelo PostGIS, mantendo `utm_x`/`utm_y` originais.
- `NOTAS.md`: este arquivo.

## Estado do banco ao final

- Verificado às 08:23: `flood_points` = 0, `dataset_imports` = 0, nenhuma tabela `spike_*`.
- `spike_flood_raw` e `spike_subpref` foram removidas. As 292 linhas de teste de `flood_points` e o registro de teste de `dataset_imports` foram apagados com `import.mjs --cleanup`.
- Os schemas `tiger` e `topology` não foram tocados.
