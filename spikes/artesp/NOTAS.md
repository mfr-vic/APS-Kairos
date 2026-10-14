# Spike T05 — ARTESP API Trilhos

Executado em 13/10/2026, 15:04 (horário de SP), com a chave do grupo no `.env` da raiz.
Script: `spike.mjs` (lê `ARTESP_KEY` sem imprimi-la; grava corpo e cabeçalhos).
Gasto: 2 das 12 requisições da hora.

## Acesso

- Base: `https://ccm.artesp.sp.gov.br/metroferroviario/api`
- Documentação: https://ccm.artesp.sp.gov.br/metroferroviario/api/docs/
- Autenticação: cabeçalho `Authorization: Api-Key <chave>`. Chave obrigatória desde 25/06/2026.
- Limite: 12 requisições/hora por credencial. Cabeçalhos observados:
  `X-RateLimit-Limit: 12`, `X-RateLimit-Remaining: 11` e depois `10`. Ao estourar, a doc indica 429 com `Retry-After`.
- Erros documentados: 401 (chave ausente, inválida, expirada ou de outro produto), 403 (IP fora da allowlist
  da credencial ou termos de uso não aceitos), 429 (limite).
- Licença: `X-Data-License: CC-BY-NC-4.0`, `Link: <https://ccm.artesp.sp.gov.br/termos-de-uso-das-apis>; rel="license"`,
  `X-API-Terms-Version: 1`. Exige atribuição e proíbe uso comercial.

## Respostas medidas

| Rota | HTTP | Latência | Tamanho |
|---|---|---|---|
| `GET /concessionarias/` | 200 | 6.905 ms (conexão fria) | 747 B |
| `GET /status/` | 200 | 141 ms | 4.226 B |

`/status/` sem filtros devolve todas as linhas numa única chamada: basta uma chamada por TTL.

## Cobertura (desde 03/09/2026 só linhas reguladas pela ARTESP)

| Linha | Operadora (`empresas[].nome`) | `empresa.id` |
|---|---|---|
| 4-Amarela | ViaQuatro | 94 |
| 5-Lilás | ViaMobilidade 5 | 100 |
| 6-Laranja | Linha Uni | 99 |
| 7-Rubi | TIC Trens | 97 |
| 8-Diamante | ViaMobilidade 8 e 9 | 98 |
| 9-Esmeralda | ViaMobilidade 8 e 9 | 98 |

Metrô (1, 2, 3, 15) e CPTM (10–13) não estão na API.

## Vocabulário observado (`status`)

| `situacao` | `classificacao` | `operacao_normal` | `descricao` | Linhas |
|---|---|---|---|---|
| Operação Normal | operacional | true | vazia ou "Linha opera normalmente em toda sua extensão." | 4, 5, 7, 9 |
| Maiores Intervalos | problema | false | "Devido à atividade de manutenção programada, os trens da Linha 8-Diamante circulam com maiores intervalos entre as estações Barueri e Itapevi." | 8 |
| Operação Encerrada | ignorar | false | vazia | 6 (às 15:04 de uma terça) |

A documentação cita também "Velocidade reduzida". A lista completa não é publicada; qualquer texto
desconhecido cai em ALTERADA pela normalização da RN06 (B.8).

## Decisões tiradas do spike

1. **Hora observada = `meta.timestamp`**, não `status.atualizado_em`. O `atualizado_em` é a hora da última
   *mudança* de status ("11 horas" atrás em linhas normais); usá-lo deixaria toda linha normal `stale`.
   Ambos vêm em hora local de SP sem fuso (o `Date` da resposta confirma: 18:04 GMT = 15:04 local).
2. **"Operação Encerrada" → PARALISADA**, mesmo com `classificacao: "ignorar"` (decisão de 10/10: linha
   fechada não pode ser usada). Vale para a linha 6, que aparece encerrada à tarde.
3. **`descricao` vira `detalhe`** no contrato 1.3.0: é a explicação da operadora e alimenta
   "Atrasos e obstáculos" no app.
4. **Precedência:** linhas 4–9 pela ARTESP; 4 e 5 caem para a página do Metrô se a ARTESP falhar.
5. **TTL 6 min, ≤ 10 chamadas/h** (C.5). Sem renovação antecipada a 80 % do TTL (daria 12,5/h).

## Arquivos

- `fixture-concessionarias.json` / `.meta.json`
- `fixture-status.json` / `.meta.json`

Nenhum arquivo desta pasta contém a chave (o script aborta se a resposta a ecoar).
