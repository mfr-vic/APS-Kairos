# Exemplos do contrato v1 (T09)

Cada arquivo é validado pelos testes de `packages/contracts` (`npm test -w packages/contracts`).

| Arquivo | Schema |
|---|---|
| `briefing-request.json` | `BriefingRequestSchema` |
| `briefing-response.json` | `BriefingResponseSchema` |
| `briefing-response-indeterminado.json` | `BriefingResponseSchema` |
| `problem-400.json` | `ProblemDetailsSchema` |

Os valores de clima, ar, ônibus e coordenadas vêm dos fixtures reais dos spikes de 10/10/2026 (`spikes/open-meteo`, `spikes/olho-vivo`, `spikes/osrm-nominatim`). São exemplos do **formato**, não medições do sistema:

- o veredito, a confiança e a janela foram preenchidos à mão, não calculados pelas regras (B.8);
- `pm25Media24h` e `faixa` estão `null` porque o fixture do spike T03 não tem as 24 h anteriores (foi pedido sem `past_days=1`);
- os UUIDs, os motivos de indisponibilidade e a observação `flood` (sem pontos) são ilustrativos.
