# Spike T04 — SPTrans Olho Vivo (API v2.1)

- **Data das medições:** 10/10/2026 (sábado), entre 08:07 e 08:25, horário America/Sao_Paulo.
- **Base:** `https://api.olhovivo.sptrans.com.br/v2.1`
- **Cliente:** Node v24.21.0, `fetch` nativo, sem dependências. User-Agent `Kairos-APS-Spike/0.1 (projeto academico)`.
- **Rede:** conexão doméstica do desenvolvedor (Windows 10). As latências abaixo são de uma única amostra cada, não são média.
- **Como rodar** (de dentro de `spikes/olho-vivo/`):
  - `node --env-file=../../.env spike.mjs` → passos 1–7, grava as fixtures, `resultado-execucao.json` e verifica se o token aparece em algum arquivo.
  - `node --env-file=../../.env kmz-retry.mjs [/KMZ/BC ...]` → novas tentativas de KMZ, acrescentadas a `resultado-kmz.json`. No Git Bash, use `MSYS_NO_PATHCONV=1` antes do comando (ver "Instabilidades").

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `spike.mjs` | Script principal (sem sessão → login → linhas → paradas → previsão → previsão por parada → KMZ). |
| `kmz-retry.mjs` | Novas tentativas de KMZ (com sentido `BC`/`CB`), feitas depois dos 500 da primeira execução. |
| `fixture-linhas.json` | Resposta real de `/Linha/Buscar?termosBusca=875A`. |
| `fixture-paradas.json` | Resposta real de `/Parada/BuscarParadasPorLinha?codigoLinha=609`. |
| `fixture-previsao.json` | Resposta real de `/Previsao?codigoParada=260016861&codigoLinha=609`. |
| `fixture-previsao-parada.json` | Resposta real de `/Previsao/Parada?codigoParada=260016861`. |
| `kmz-bc.kmz` | KMZ real de `/KMZ/BC` (93.133 bytes, mantido porque é < 5 MB). |
| `fixture-kml-amostra.kml` | Amostra do KML interno: estilos + 1º Placemark, com coordenadas truncadas. |
| `resultado-execucao.json` | Log da execução de `spike.mjs` (status, latência, bytes, content-type por chamada). |
| `resultado-kmz.json` | Log consolidado de **todas** as tentativas de KMZ (as de `spike.mjs` e as de `kmz-retry.mjs`). |

Nenhum arquivo contém o token nem o valor do cookie de sessão (verificado em Node no fim; ver última seção).

## Chamadas e latências medidas

| Hora | Chamada | Status | Latência | Bytes | Content-Type |
|---|---|---|---|---|---|
| 08:07:10 | `GET /Linha/Buscar?termosBusca=875A` **sem cookie** | 401 | 771 ms¹ | 61 | application/json |
| 08:07:10 | `POST /Login/Autenticar?token=***` | 200 (`true`) | 396 ms | 4 | application/json |
| 08:07:10 | `GET /Linha/Buscar?termosBusca=875A` | 200 | 49 ms | 167 | application/json |
| 08:07:10 | `GET /Parada/BuscarParadasPorLinha?codigoLinha=609` | 200 | 43 ms | 712 | application/json |
| 08:07:10 | `GET /Previsao?codigoParada=260016861&codigoLinha=609` | 200 | 49 ms | 442 | application/json |
| 08:07:10 | `GET /Previsao/Parada?codigoParada=260016861` | 200 | 47 ms | 5.635 | application/json |
| 08:08:10 | `GET /KMZ` | **500** | 60.060 ms | 36 | application/json |
| 08:09:11 | `GET /KMZ/Corredor` | **500** | 60.415 ms | 36 | application/json |
| 08:10:11 | `GET /KMZ/OutrasVias` | **500** | 60.401 ms | 36 | application/json |
| 08:11:58 | `GET /KMZ/Corredor/BC` | **500** | 60.369 ms | 36 | application/json |
| 08:13:45 | `GET /KMZ/BC` | **200** | **107.081 ms** | 93.133 | application/vnd.google-earth.kmz |
| 08:24:30 | `GET /KMZ` (2ª tentativa) | **500** | 60.367 ms | 36 | application/json |
| 08:25:31 | `GET /KMZ/OutrasVias/BC` | **500** | 60.426 ms | 36 | application/json |

¹ A primeira chamada inclui DNS + handshake TLS; as seguintes reaproveitam a conexão.

Os logins de `kmz-retry.mjs` (08:10:57, 08:23:05, 08:23:30) também retornaram `200 true`; a latência deles não foi registrada.

## Autenticação e comportamento sem sessão

- `POST /Login/Autenticar?token=…` → `200`, corpo `true` (JSON booleano). Devolve **um** cookie: `apiCredentials`, com atributos `path`, `HttpOnly`, `SameSite`. Não veio `Expires`/`Max-Age`, ou seja, é cookie de sessão; o tempo de validade no servidor **não foi medido**.
- O cliente precisa reenviar o cookie `apiCredentials` (cabeçalho `Cookie`) em todas as chamadas. O `fetch` do Node não guarda cookies; o backend vai ter que extrair o valor de `getSetCookie()` e guardá-lo em memória.
- **Sem cookie:** `401`, `application/json; charset=utf-8`, corpo `{"Message":"Authorization has been denied for this request."}`. Isso confirma o plano de **renovar a sessão em 401** (refazer o login uma vez e repetir a chamada).
- Token recusado: **não testado** (não fizemos login com token inválido).

## Mapa de campos (observado nas respostas + documentação oficial)

### `/Linha/Buscar` → array
| Campo | Tipo (observado) | Significado |
|---|---|---|
| `cl` | number | código da linha, **único por sentido** (875A: `609` sentido 1, `33377` sentido 2) |
| `lc` | boolean | linha circular |
| `lt` | string | 1ª parte do letreiro (`"875A"`) |
| `tl` | number | 2ª parte do letreiro / modo de operação (`10` = base) |
| `sl` | number | sentido: 1 = principal→secundário, 2 = secundário→principal |
| `tp` | string | letreiro do terminal principal (`"PERDIZES"`) |
| `ts` | string | letreiro do terminal secundário (`"AEROPORTO"`) |

O letreiro completo é `${lt}-${tl}` → `875A-10`.

### `/Parada/BuscarParadasPorLinha` → array
| Campo | Tipo | Significado |
|---|---|---|
| `cp` | number | código da parada |
| `np` | string | nome da parada |
| `ed` | string | endereço |
| `py` / `px` | number | latitude / longitude |

Observação: para `cl=609` vieram só **6 paradas**, e os nomes misturam sufixos `B/C` e `C/B`. A lista parece não ter todas as paradas do itinerário nem estar em ordem de percurso. Não use essa resposta como itinerário.

### `/Previsao` e `/Previsao/Parada` → objeto
| Campo | Tipo | Significado |
|---|---|---|
| `hr` | string `"HH:mm"` | horário de referência da geração (horário local, sem data) |
| `p.cp`, `p.np`, `p.py`, `p.px` | | parada |
| `p.l[]` | array | linhas que atendem a parada |
| `p.l[].c` | string | letreiro completo (`"875A-10"`) |
| `p.l[].cl`, `p.l[].sl` | number | código e sentido da linha |
| `p.l[].lt0` / `p.l[].lt1` | string | letreiro de destino / de origem |
| `p.l[].qv` | number | quantidade de veículos localizados |
| `p.l[].vs[]` | array | veículos |
| `vs[].p` | string | prefixo do veículo (`"64686"`) |
| `vs[].t` | string `"HH:mm"` | **horário previsto de chegada** na parada (sem data, sem segundos) |
| `vs[].a` | boolean | acessível |
| `vs[].ta` | string ISO 8601 UTC | horário da captura da posição (`"2026-10-10T11:07:06Z"`) |
| `vs[].py` / `vs[].px` | number | posição do veículo |
| `vs[].sv`, `vs[].is` | null | **fora da documentação**; vieram `null` em todos os veículos observados |

Quando não há previsão, o formato **não foi observado** (todas as consultas feitas tinham veículos).

### Previsão real obtida
- Linha **875A-10** (`cl=609`, sentido 1, PERDIZES→AEROPORTO), parada **CAIO PRADO B/C** (`cp=260016861`), `hr=08:07`: **2 veículos**. Prefixo 64686 previsto para 08:20 e prefixo 64731 para 08:30, ambos com `a=true` e posição capturada às 11:07:06Z e 11:06:48Z.
- A mesma parada em `/Previsao/Parada` às 08:07 retornou **15 linhas e 31 veículos**.
- Para converter `t` (`HH:mm`) em instante absoluto, use a data local de São Paulo. Perto da meia-noite, a virada de dia fica ambígua (caso não testado).

## KMZ (fluidez / velocidade)

- **Só `/KMZ/BC` funcionou**: `200`, `Content-Type: application/vnd.google-earth.kmz`, **93.133 bytes**, assinatura `PK\x03\x04` (ZIP), em **107 s**.
- **Formato interno:** ZIP com **1 entrada**, `TBC.kml` (deflate, 93.021 bytes comprimido, **674.355 bytes** descomprimido). Leitura feita pelo diretório central do ZIP, em Node. O KML foi extraído com o `tar.exe` do Windows numa pasta temporária fora do repositório.
- **Estrutura do KML:** `kml` > `Document` > 4 `Style` (`id` 0–3, só `LineStyle`) + **127 `Folder`** (um por via/corredor, ex.: "Corredor PARELHEIROS-RIO BONITO-SANTO AMARO (BAIRRO - CENTRO)", "CELSO GARCIA (BAIRRO - CENTRO)"). Dentro deles há **322 `Placemark`**, com 376 `LineString` no total (40 Placemarks usam `MultiGeometry`). Não há `Point` nem `ExtendedData`.
- **Estilos (cor KML `aabbggrr`):** `#0` = `ffc0c0c0` (cinza, sem dado); `#1` = `ff0000ff` (vermelho); `#2` = `ff00CDFF` (amarelo/âmbar); `#3` = `ff009900` (verde). A faixa de velocidade de cada cor **não aparece no arquivo**.
- **Onde fica a velocidade:** não existe atributo estruturado. A velocidade está em **HTML escapado dentro de `<description>`**, por exemplo: `Trecho: de T PARELHEIROS até T VARGINHA`, `Referência: AV. SADAMU INOUE`, `Extensão (metros): 0`, `Velocidade média do trecho` (num `div` com a cor de fundo) e `Velocidade média do corredor`. Para extrair, é preciso fazer parsing de HTML/regex.
- **Atributo `eBC` no `<Placemark>`** (ex.: `eBC="8,4"`, com vírgula decimal, valores de 0 a 13). Não está documentado e o significado **não foi verificado** (hipótese: extensão em km no sentido BC).
- **Dados de velocidade observados às 08:13:** **todos os 322 Placemarks** usavam `styleUrl #0` (cinza) e velocidade `--`. Todas as 322 extensões eram `0` e as 53 "velocidade média do corredor" eram `--`. Ou seja, **a estrutura foi recebida, mas sem nenhum valor de velocidade**. Não sabemos se isso acontece em outros horários ou em dias úteis.
- A amostra está em `fixture-kml-amostra.kml`.

## Instabilidades observadas

1. **KMZ muito instável/lento:** de 8 tentativas válidas, **7 deram `500 {"Message":"An error has occurred."}` após ~60 s**, o que sugere timeout do lado do servidor. A única com sucesso levou 107 s. `/KMZ`, `/KMZ/Corredor`, `/KMZ/OutrasVias` e `/KMZ/Corredor/BC` nunca funcionaram neste spike. Consequências para o projeto:
   - o KMZ **não pode** ser consultado durante uma requisição do app: precisa de um job em background (worker), timeout ≥ 120 s, cache longo e fallback para "sem dados de fluidez";
   - mesmo com sucesso, o conteúdo pode vir sem velocidades.
2. **Endpoints JSON** (linhas/paradas/previsão) responderam rápido e estáveis: 43–49 ms com a conexão aquecida.
3. **Artefato do ambiente (não é da API):** em 08:23:09, duas tentativas de `kmz-retry.mjs` retornaram `400` (página HTML "Runtime Error") porque o Git Bash converteu os argumentos `/KMZ…` em `C:/Program Files/Git/KMZ…`. Elas estão em `resultado-kmz.json` marcadas como `descartada` e não contam nas estatísticas acima.
4. Medição feita num sábado de manhã, uma vez só. Não houve coleta em dia útil, horário de pico nem várias amostras.

## Critério de pronto da T04

| Critério | Situação |
|---|---|
| Previsão real obtida para uma linha e parada | **Atingido.** 875A-10 (`cl=609`) na parada `260016861`, 2 veículos com `t` = 08:20 e 08:30, em 10/10/2026 08:07 (`fixture-previsao.json`). |
| Tamanho e formato do KMZ registrados | **Atingido, com ressalvas.** `/KMZ/BC`: 93.133 bytes, `application/vnd.google-earth.kmz`, ZIP com `TBC.kml` (674.355 bytes, 322 Placemarks, velocidade em HTML no `<description>` e cor por `styleUrl`). Ressalvas: `/KMZ`, `/KMZ/Corredor` e `/KMZ/OutrasVias` (com e sem sentido) só deram 500, e o KMZ obtido veio **sem valores de velocidade** (tudo `--`). |

**Conclusão:** a T04 está atingida. Previsão de chegada (Olho Vivo) é viável e rápida. A fluidez por KMZ é **de alto risco**: lenta, falha na maioria das vezes e pode vir vazia. Ela deve ser tratada como opcional, só com worker e cache, e precisa de nova medição em dia útil antes de ir para o escopo final.

## Verificação de segurança

Em 10/10/2026, um script Node leu todos os arquivos da pasta e procurou dois padrões, sem imprimir nenhum valor:
- o valor de `process.env.SPTRANS_TOKEN`;
- o nome do cookie seguido de `=` e um valor, e o cabeçalho de resposta que define cookies seguido de dois-pontos. O valor do cookie nunca é gravado (fica só em memória).

Resultado (depois de reescrever dois exemplos ilustrativos deste próprio NOTAS.md que davam falso positivo): **nenhuma ocorrência**. Nos logs, o token aparece só como `***`.
