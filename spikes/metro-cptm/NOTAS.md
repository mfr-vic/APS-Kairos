# Spike T06 — Status Metrô/CPTM (RF21)

Data da investigação: **10/10/2026, das 08:05 às 08:10 (America/Sao_Paulo)**.
Requisições feitas: 11 no total (2 com curl, 9 com `fetch` do Node 24), espaçadas de 3 a 5 s, User-Agent
`Kairos-APS/0.1 (projeto academico; contato: mfr.vic@gmail.com)`. Não houve tentativa de contornar bloqueios.

Legenda: **[FATO]** = verificado nesta sessão; **[INTERPRETAÇÃO]** = leitura/opinião do autor do spike.

## 1. URLs consultadas

| Hora (SP) | URL | Resultado |
|---|---|---|
| 08:05:50 | https://www.metro.sp.gov.br/robots.txt (curl/Windows schannel) | Falha de handshake TLS (`curl: (35) schannel`) |
| 08:05:5x | https://www.cptm.sp.gov.br/robots.txt (curl) | Redireciona para `/cptm`; página de desafio Incapsula |
| 08:06:44 | https://www.metro.sp.gov.br/robots.txt (Node fetch) | HTTP 200, `text/plain` |
| 08:07:10 | https://www.metro.sp.gov.br/sua-viagem/direto-metro/ | HTTP 200, HTML (WordPress) |
| 08:07:45 | https://www.metro.sp.gov.br/wp-content/themes/metrosp/direto-metro.php?embed=1 | HTTP 200, HTML com o status das linhas |
| 08:08:08 | https://www.metro.sp.gov.br/wp-content/themes/metrosp/assets/js/direto-metro.js?ver=1.603.1167 | HTTP 200, JS de 961 bytes |
| 08:08:36 | https://www.metro.sp.gov.br/politica-de-cookies-br/ | HTTP 200 |
| 08:08:54 | https://www.cptm.sp.gov.br/robots.txt (Node fetch) | Redireciona para `/cptm`; desafio Incapsula |
| 08:09:13 | https://www.cptm.sp.gov.br/ | Desafio Incapsula |
| 08:09:19 | http://cptm.sp.gov.br/robots.txt | Redireciona para `https://www.cptm.sp.gov.br/cptm`; desafio Incapsula |
| 08:09:42 | iframe do Direto do Metrô (via `spike.mjs`) | HTTP 200; gerou `fixture.json` |

## 2. robots.txt

**Metrô [FATO]** (https://www.metro.sp.gov.br/robots.txt, 08:06:44):
```
User-agent: *
Allow: /
Disallow: /?s=*
Disallow: /search/*

Sitemap: https://www.metro.sp.gov.br/sitemap_xml.php
```
- Os caminhos relevantes (`/sua-viagem/direto-metro/` e `/wp-content/themes/metrosp/direto-metro.php`) **não** estão proibidos.
- O documento do iframe tem `<meta name="robots" content="noindex,nofollow" />`. [INTERPRETAÇÃO] Essa meta trata de indexação por buscadores, não proíbe a consulta; mesmo assim, indica que o iframe não foi pensado como recurso público de reuso.

**CPTM [FATO]**: não foi possível ler o robots.txt. Tanto `https://www.cptm.sp.gov.br/robots.txt` quanto `http://cptm.sp.gov.br/robots.txt` são redirecionados para `https://www.cptm.sp.gov.br/cptm`, que devolve (HTTP 200, ~1 KB) uma página de desafio do **Imperva Incapsula**:
```
<META NAME="ROBOTS" CONTENT="NOINDEX, NOFOLLOW"> ... <script src="/_Incapsula_Resource?SWJIYLWA=..."></script>
... Request unsuccessful. Incapsula incident ID: 525000810330516281-...
```
Cabeçalhos observados: `set-cookie: visid_incap_3316744=...`, `incap_ses_525_3316744=...`, `x-iinfo: ...`. A página inicial (`https://www.cptm.sp.gov.br/`) deu o mesmo resultado.

## 3. Termos de uso

- **Metrô [FATO]**: no rodapé da página do Direto do Metrô não há link de "Termos de uso". Os links institucionais encontrados são Transparência, SIC (fala.sp.gov.br), Ouvidoria, Canal de Denúncia e a **Política de Cookies** (https://www.metro.sp.gov.br/politica-de-cookies-br/). Uma busca no texto dessa política por "reprodu", "automati", "coleta", "rob", "scrap", "direitos autorais", "termos de uso" e "copyright" só encontrou o trecho sobre excluir cookies no navegador; ela não trata de reprodução nem de coleta automatizada.
- [FATO] Não foi encontrada licença aberta nem API/dados abertos para o status das linhas nas páginas consultadas. Não pesquisei portais de dados abertos externos.
- **CPTM [FATO]**: não foi possível consultar nenhuma página do site, porque tudo passa pelo desafio Incapsula.
- [INTERPRETAÇÃO] Sem termos explícitos, o reuso fica numa zona cinzenta. É informação pública de serviço, mas não há permissão expressa. Por isso o app deve citar a fonte ("Fonte: Direto do Metrô — metro.sp.gov.br") e fazer poucas consultas.

## 4. Estrutura da fonte

### Metrô — Direto do Metrô [FATO]
- A página `https://www.metro.sp.gov.br/sua-viagem/direto-metro/` (WordPress 6.2.14) **não contém** o status. Ela embute o iframe
  `<iframe src="/wp-content/themes/metrosp/direto-metro.php?embed=1" ...>`.
- O iframe **é renderizado no servidor**: o status já vem no HTML, sem XHR/JSON. O único script específico (`direto-metro.js`) apenas recarrega a página a cada 60 s (`window.location = window.location`). O iframe também tem `<meta http-equiv="refresh" content="75">`. Não foi encontrado nenhum endpoint JSON.
- Formato de cada linha (exemplo real, abreviado):
  ```html
  <li class="linha list-group-item">
    <div class="linha-numero" style="background-color: #171796">1</div>
    <div class="linha-nome">Azul</div>
    <div class="linha-situacao" title="Operação Normal">Operação Normal</div>
    <div class="linha-info dashicons dashicons-info-outline" data-bs-toggle="tooltip" data-bs-html="true"
         data-bs-title="<div class='title' style='background-color:#00E000 !important'>Metrô</div>
                        <div class='description'>Situação Normal</div>
                        <div class='date'>(atualizado em 10/10/2026 08:07:11)</div>"
         title="[Metrô] Situação Normal (atualizado em 10/10/2026 08:07:11)"></div>
    <div class="linha-situacao-icon" style="background-color: #00E000; ..."></div>
  </li>
  ```
- Campos extraíveis: número, nome (cor), situação curta, título do tooltip (operadora ou tipo de operação), descrição, data/hora de atualização e cor do indicador.
- Linhas presentes [FATO]: 1-Azul, 2-Verde, 3-Vermelha, 4-Amarela (ViaQuatro), 5-Lilás (ViaMobilidade), 15-Prata e 17-Ouro. **Todas as quatro linhas do Metrô exigidas pelo RF21 (1, 2, 3, 15) estão presentes.** As linhas da CPTM e as 8/9 **não** aparecem.
- Atualização [FATO]: o carimbo das linhas 1/2/3/15 passou de `08:07:11` (consulta das 08:07:45) para `08:08:24` (consulta das 08:09:42). Ou seja, ele é atualizado pelo menos a cada poucos minutos.

### CPTM [FATO]
- Não foi possível identificar a fonte: o domínio inteiro responde com desafio anti-bot (Imperva Incapsula), que exige execução de JavaScript e cookies. Não tentei contornar o desafio, conforme as regras do spike.

## 5. Amostra de status observada (10/10/2026 08:07–08:09, sábado)

Valores de `linha-situacao` vistos: **"Operação Normal"** (linhas 1, 2, 3, 4, 5, 15) e **"Operação Transitória"** (linha 17, descrição "Operação transitória das 6h às 22h de segunda a sábado.", cor `#FFFFFF`).
Valores de descrição vistos: "Situação Normal" (operadas pelo Metrô), "Operação Normal" (ViaQuatro/ViaMobilidade).
Cor observada para normal: `#00E000`.
[INTERPRETAÇÃO] Devem existir outros estados (ex.: velocidade reduzida, paralisada, encerrada), mas **não foram observados**. O vocabulário completo é desconhecido, então o parser precisa tratar qualquer texto como livre e mapear para "desconhecido" o que não reconhecer.

Amostra completa em `fixture.json` (coleta real das 08:09:42).

## 6. Riscos e fragilidade

1. **CPTM bloqueada [FATO]**: há anti-bot Incapsula. Pelas regras do projeto, isso é no-go para as linhas 10, 11, 12 e 13. [INTERPRETAÇÃO] Mesmo que se contornasse o desafio, seria antiético e instável (o desafio também bloquearia o servidor em nuvem).
2. **Sem API nem termos explícitos [FATO]**: a fonte do Metrô é HTML interno do tema WordPress (`/wp-content/themes/metrosp/...`), sem contrato. [INTERPRETAÇÃO] Pode mudar de caminho ou de marcação a qualquer momento, por exemplo numa atualização do tema (`ver=1.603.1167`).
3. **Parsing por regex/HTML [INTERPRETAÇÃO]**: é frágil a mudanças de classe CSS. Mitigação: se nenhuma linha for extraída, devolver "indisponível" em vez de falhar.
4. **TLS [FATO]**: o `curl` do Windows (schannel) falhou no handshake com metro.sp.gov.br, e o `fetch` do Node 24 funcionou. [INTERPRETAÇÃO] Vale testar a partir do contêiner/servidor de produção antes de confiar na fonte.
5. **Estados não observados [FATO]**: só houve estados normais e transitórios. Não há amostra de falha para testar o mapeamento (TC). O teste dependeria de fixture sintética, e ela precisaria ser identificada como sintética.
6. **Carga [INTERPRETAÇÃO]**: o próprio site recarrega a cada 60–75 s por usuário. Uma consulta do servidor com TTL de 5 min e cache compartilhado é desprezível. Somente o backend deve consultar; o app nunca deve consultar direto.

## 7. Custo para o prazo [INTERPRETAÇÃO]

- Metrô: `spike.mjs` já extrai os dados. Para levar ao backend (adapter + cache TTL + rota + teste com fixture + card no app), a estimativa é de **~1 a 1,5 dia**, o que cabe antes do congelamento em 02/11.
- CPTM: sem fonte permitida, o custo é indeterminado. Não cabe no prazo.

## 8. Parecer go/no-go do RF21

**Recomendação: GO PARCIAL — apenas Metrô (linhas 1, 2, 3, 15); NO-GO para CPTM (10, 11, 12, 13).** A decisão final é do grupo.

Justificativa:
- [FATO] O Metrô publica o status no HTML renderizado no servidor (`direto-metro.php?embed=1`), o robots.txt permite a consulta, não houve proteção anti-bot e as 4 linhas exigidas estão presentes com carimbo de atualização.
- [FATO] A CPTM está atrás do Imperva Incapsula em todo o domínio, inclusive no robots.txt. Pela regra do spike, isso é sinal de no-go, e não há fonte alternativa oficial verificada.
- [INTERPRETAÇÃO] Como o RF21 é opcional, a implementação parcial deve ser **isolada e descartável**:
  1. só o backend consulta (TTL ≥ 5 min, User-Agent próprio, timeout curto);
  2. se o parse falhar, a resposta é `indisponivel`, sem quebrar o app;
  3. as linhas CPTM aparecem como "sem dados (fonte não disponível)" ou são omitidas;
  4. o app exibe "Fonte: Direto do Metrô (metro.sp.gov.br)" e o horário de atualização da própria fonte;
  5. a limitação fica registrada na documentação (escopo reduzido do RF21).
- Alternativa conservadora: se o grupo preferir não depender de HTML sem contrato nem termos, **NO-GO total** e RF21 vira "trabalho futuro". O custo de desistir é baixo, porque o requisito é opcional.

## 9. Arquivos

- `spike.mjs`: faz uma requisição ao iframe do Direto do Metrô e extrai as linhas para JSON (`node spikes/metro-cptm/spike.mjs [saida.json]`).
- `fixture.json`: saída real de `spike.mjs` em 10/10/2026 08:09:42 (SP).
