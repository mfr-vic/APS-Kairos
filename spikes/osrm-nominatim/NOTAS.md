# Spike T08 — OSRM (servidor demo) + Nominatim (OSMF)

- **Execução:** 10/10/2026, de 08:06:45 a 08:07:26 (America/Sao_Paulo), uma única execução de `node spikes/osrm-nominatim/spike.mjs` (Node 24, `fetch` nativo, sem dependências).
- **User-Agent em todas as requisições:** `Kairos-APS/0.1 (projeto academico; contato: mfr.vic@gmail.com)`
- **Total de chamadas:** Nominatim = 6 (5 `search` + 1 `reverse`); OSRM = 3 (`route`). Fila serial com espera mínima de 1100 ms entre chamadas ao mesmo serviço; repetições espaçadas em mais 2500 ms. Teto de 10 chamadas por serviço no próprio script.
- **Políticas lidas em:** 10/10/2026 (via WebFetch).

## URLs usadas

```
https://nominatim.openstreetmap.org/search?format=jsonv2&q=<endereço>&countrycodes=br&viewbox=-46.83,-23.35,-46.36,-24.01&bounded=1&limit=5
https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=-23.5503898&lon=-46.633081&zoom=18
https://router.project-osrm.org/route/v1/driving/-46.6559677,-23.5614961;-46.633081,-23.5503898?overview=full&geometries=geojson
```

## Resultados medidos (10/10/2026)

### Nominatim `/search` (`fixture-geocode.json`)

| Consulta | Hora | HTTP | Latência | Nº de resultados | 1º resultado (lat, lon) |
|---|---|---|---|---|---|
| Avenida Paulista, 1578, São Paulo | 08:06:52 | 200 | 11 746 ms | 2 | -23.5614961, -46.6559677 — "Museu de Arte de São Paulo, 1578, Avenida Paulista, Cerqueira César, Bela Vista, São Paulo, …, 01310-200, Brasil" (`tourism/museum`) |
| Praça da Sé, São Paulo | 08:07:05 | 200 | 865 ms | 5 | -23.5503898, -46.633081 — "Praça da Sé, Glicério, Sé, São Paulo, …, 01001-000, Brasil" |
| Estação da Luz, São Paulo | 08:07:07 | 200 | 969 ms | 3 | "Estação da Luz, 1, Praça da Luz, Bairro da Luz, Bom Retiro, São Paulo, …" |
| Avenida Paulista, 1578 (repetição 2) | 08:07:12 | 200 | 27 ms | 2 | idem |
| Avenida Paulista, 1578 (repetição 3) | 08:07:15 | 200 | 24 ms | 2 | idem |

Latência do `search` do MASP (3 amostras): mín 24 ms, máx 11 746 ms, média 3 932 ms. Todas as 5 buscas: mín 24, máx 11 746, média 2 726 ms.

Observações:
- A 1ª chamada (11,7 s) inclui DNS + TLS da primeira conexão, mas o valor é alto; não foi investigado. As repetições idênticas (24–27 ms) sugerem cache do lado do servidor/proxy — **hipótese não verificada** (cabeçalhos de resposta não foram registrados).
- Para "Estação da Luz", o 2º e o 3º resultados são endereços na Av. Prestes Maia (provavelmente acessos/entradas com o mesmo nome) — o adaptador deve preferir o 1º resultado e/ou filtrar por `category`/`type`.
- "Avenida Paulista, 1578" retornou também um `highway/elevator` com o mesmo número — confirmar que pegar `[0]` (maior `importance`) basta.
- Diferença de 7 s entre o log "Início" (08:06:45) e o carimbo da 1ª chamada (08:06:52) não foi explicada (o carimbo é tirado antes do `fetch`); não afeta a latência medida.

### Nominatim `/reverse` (`fixture-reverse.json`)

- Ponto: -23.5503898, -46.633081 (Praça da Sé, vindo do `search`). 08:07:16, HTTP 200, **338 ms**.
- `display_name`: "Abertura, Rua Santa Teresa, Glicério, Sé, São Paulo, Região Sudeste, 01016-020, Brasil" (o objeto mais próximo foi um `tourism` chamado "Abertura", não a praça em si — o `reverse` com `zoom=18` devolve o objeto OSM mais próximo; para exibir ao usuário, montar o texto a partir de `address.road`/`suburb`/`city`).
- `licence`: "Data © OpenStreetMap contributors, ODbL 1.0. http://osm.org/copyright"

### OSRM `/route` MASP → Praça da Sé (`fixture-route.json`)

| Amostra | Hora | HTTP | Latência |
|---|---|---|---|
| #1 | 08:07:17 | 200 | 1 167 ms |
| #2 | 08:07:21 | 200 | 223 ms |
| #3 | 08:07:25 | 200 | 221 ms |

Latência (3 amostras): mín 221 ms, máx 1 167 ms, média 537 ms. Resposta de 5 189 bytes.

- `code`: `Ok`
- `routes[0].distance`: **4 949,8 m**
- `routes[0].duration`: **575,3 s** (~9,6 min, perfil `driving`, sem trânsito)
- `routes[0].geometry.coordinates`: **189 pontos** (GeoJSON LineString, ordem `[lon, lat]`)
- `waypoints` (pontos ajustados à malha): origem "Passagem Subterrânea Daher Elias Cutait" [-46.655871, -23.561539] a 11,0 m do ponto pedido; destino "Rua Irmã Simpliciana" [-46.632877, -23.550075] a 40,6 m.
- Sem campo de licença/atribuição na resposta do OSRM.

## Mapa de campos usados (para o adaptador)

| Serviço | Campo | Tipo/observação | Uso no Καιρός |
|---|---|---|---|
| Nominatim search/reverse | `lat`, `lon` | **string** (converter com `Number`) | coordenada do endereço |
| Nominatim | `display_name` | string longa | rótulo exibido |
| Nominatim | `name`, `category`, `type`, `addresstype`, `importance` | metadados | desempate/filtro de resultados |
| Nominatim | `boundingbox` | `[latMin, latMax, lonMin, lonMax]` como strings | enquadrar mapa |
| Nominatim | `osm_type`, `osm_id`, `place_id` | id | chave estável de cache |
| Nominatim reverse | `address.{road,suburb,city,postcode,…}` | objeto | rótulo curto |
| Nominatim | `licence` | string | atribuição |
| OSRM | `code` | `"Ok"` ou erro | validação |
| OSRM | `routes[0].distance` | metros (number) | distância |
| OSRM | `routes[0].duration` | segundos (number) | tempo estimado |
| OSRM | `routes[0].geometry.coordinates` | `[lon, lat][]` | desenhar a rota (inverter para `{latitude, longitude}` no mapa) |
| OSRM | `routes[0].legs[0].summary` | veio vazio (`""`) nesta rota | — |
| OSRM | `waypoints[].location`, `.distance`, `.name` | ponto ajustado à via | aviso se o ajuste for grande |

## Políticas (lidas em 10/10/2026)

### Nominatim — https://operations.osmfoundation.org/policies/nominatim/

| Item | Situação | Citação |
|---|---|---|
| Limite de 1 req/s | **Confirmado** | "No heavy uses (an absolute maximum of 1 request per second)." |
| User-Agent/Referer | **Confirmado** | "Provide a valid HTTP Referer or User-Agent identifying the application" |
| Uso massivo | **Confirmado** | "As a general rule, bulk geocoding of larger amounts of data is not encouraged." / "Scripts running longer than a day and scripts that are run at regular intervals are restricted to 4 requests per minute." |
| Autocomplete proibido | **Confirmado** | "This is not yet supported by Nominatim and you must not implement such a service on the client side" |
| Cache | **Confirmado** | "Results must be cached on your side." |
| Atribuição / ODbL | **Confirmado** | "Clearly display attribution as suitable for your medium." / "Data is provided under the ODbL license which requires to share alike" |
| Sem SLA | **Confirmado indiretamente** (não há frase "sem SLA"; há:) | "the service runs on donated servers and has a very limited capacity." / "you might have your access withdrawn." |
| Bloqueio por repetição | **Confirmado** | "Clients sending repeatedly the same query may be classified as faulty and blocked." |

Atenção: o próprio spike repetiu a mesma consulta 3 vezes (para medir latência). Não repetir isso em produção — o cache local resolve.

### OSRM demo — https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server

| Item | Situação | Citação |
|---|---|---|
| Limite de 1 req/s | **Confirmado** | "Do not exceed 1 request per second." |
| Uso aceitável | **Confirmado** | "the demo server usage is restricted to reasonable, non-commercial use-cases." |
| Sem SLA | **Confirmado** | "We provide no guarantees wrt. uptime, latency, or data updates." |
| User-Agent/Referer | **Não está na página do wiki**; confirmado em https://routing.openstreetmap.de/about.html (servidor FOSSGIS citado pelo wiki) | "Use a valid user agent and, if applicable, a correct referrer." |
| Uso massivo | **Não está no wiki**; confirmado no about.html | "No scraping, no heavy usage." |
| Atribuição | **Não está no wiki**; about.html pede atribuição | "Display the required attribution and display a link to" (página "fix the map") |
| ODbL | **Não encontrado** nas páginas do OSRM (a licença ODbL dos dados OSM está confirmada na política do Nominatim e no campo `licence` da resposta) | — |
| Cache | **Não encontrado** | — |
| Política completa FOSSGIS (alemão) | **Não lida** — https://fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen/ respondeu com bloqueio anti-bot (Anubis, "Access Denied") ao WebFetch | — |

## Recomendações para o adaptador (backend)

1. **Só o servidor consulta** OSRM e Nominatim; o app nunca chama direto (UA controlado, cache central, respeito ao limite).
2. **Fila serial por serviço com ≤ 1 req/s** (espera ≥ 1100 ms entre chamadas; uma fila para Nominatim e outra para OSRM). Se a fila crescer, rejeitar/adiar em vez de acelerar.
3. **User-Agent próprio** em toda requisição: `Kairos-APS/0.1 (projeto academico; contato: …)` (configurável via `.env`).
4. **Cache:** Nominatim 30 dias (chave = consulta normalizada: minúsculas, sem acentos/espaços extras; reverse = lat/lon arredondados a 5 casas); OSRM 7 dias (chave = perfil + coordenadas arredondadas a 5 casas).
5. **Sem autocomplete**: geocodificar só ao confirmar (botão/enter), nunca a cada tecla. Se houver sugestão, usar apenas entradas já em cache ou lista local de lugares.
6. **Restrição a SP**: manter `countrycodes=br&viewbox=-46.83,-23.35,-46.36,-24.01&bounded=1`; descartar resultados fora do município.
7. **Converter tipos**: `lat`/`lon` do Nominatim são strings; geometria do OSRM é `[lon, lat]`.
8. **Timeout** de ~5 s no OSRM e ~10 s no Nominatim (a 1ª chamada medida levou 11,7 s — considerar 15 s ou retentativa única após o espaçamento) e **fallback de linha reta** (haversine entre origem e destino, geometria com 2 pontos, duração estimada por velocidade média, marcado como `aproximado: true`) quando o OSRM falhar/estourar o tempo/retornar `code != "Ok"`.
9. **Atribuição** visível no app: "© OpenStreetMap contributors (ODbL)" com link para https://www.openstreetmap.org/copyright, e menção a OSRM/Nominatim.
10. Não usar em escala/carga (testes de carga devem usar fixtures ou mock, nunca os servidores públicos).

## Critério de pronto da T08

> Rota e geocodificação de um endereço real obtidas; limite de 1 req/s anotado.

- Geocodificação de endereço real: **atingido** — "Avenida Paulista, 1578, São Paulo" → MASP (-23.5614961, -46.6559677), HTTP 200, 10/10/2026 08:06:52.
- Rota real: **atingido** — MASP → Praça da Sé, 4 949,8 m, 575,3 s, 189 pontos, HTTP 200, 10/10/2026 08:07:17.
- Limite de 1 req/s anotado: **atingido** — confirmado nas duas políticas (citações acima) e implementado no script (≥ 1100 ms entre chamadas).

**Resultado: critério de pronto da T08 atingido.** Pendências: ler a política completa da FOSSGIS em navegador (bloqueada por anti-bot ao acesso automatizado) e investigar a latência de 11,7 s da primeira chamada ao Nominatim.
