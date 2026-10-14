# Spike T03 — Open-Meteo (clima + qualidade do ar)

Ponto: Praça da Sé, São Paulo (lat -23.5505, lon -46.6333). Script: `spike.mjs` (Node 24, `fetch` nativo, sem dependências).
User-Agent: `Kairos-APS/0.1 (projeto academico; contato: mfr.vic@gmail.com)`.

## Medições (fuso America/Sao_Paulo)

O script foi executado 2 vezes em 10/10/2026. Os fixtures salvos são os da 2ª execução (cada execução sobrescreve).

| Execução | Chamada | Início | HTTP | Latência (ida e volta, medida no cliente) | Bytes |
|---|---|---|---|---|---|
| 1 | Forecast | 2026-10-10 08:06:45 | 200 | 11572 ms | 2338 |
| 1 | Air Quality | 2026-10-10 08:07:04 | 200 | 1272 ms | 2503 |
| 2 | Forecast | 2026-10-10 08:07:55 | 200 | 984 ms | 2338 |
| 2 | Air Quality | 2026-10-10 08:07:56 | 200 | 1152 ms | 2503 |

Observações:
- A 1ª chamada à Forecast levou ~11,6 s; a 2ª, < 1 s. A causa não foi investigada (provavelmente DNS/TLS a frio no cliente ou rede local — **não verificado**). Como a latência pode ter picos, o backend deve usar timeout e cache.
- `generationtime_ms` informado pelo servidor nos fixtures: ~0,7 ms (forecast) e ~0,6 ms (air quality); ou seja, quase todo o tempo é rede.
- Amostra muito pequena (2 por API); não serve como métrica de desempenho, só como ordem de grandeza.

## URLs exatas usadas

Forecast:
```
https://api.open-meteo.com/v1/forecast?latitude=-23.5505&longitude=-46.6333&current=temperature_2m,precipitation,rain,weather_code&hourly=temperature_2m,precipitation,precipitation_probability,weather_code&timezone=America%2FSao_Paulo&forecast_days=2
```

Air Quality:
```
https://air-quality-api.open-meteo.com/v1/air-quality?latitude=-23.5505&longitude=-46.6333&current=pm2_5,pm10,european_aqi,us_aqi&hourly=pm2_5,pm10,european_aqi,us_aqi,us_aqi_pm2_5&timezone=America%2FSao_Paulo&forecast_days=2
```

## O que veio nas respostas (medido)

Forecast (`fixture-forecast.json`):
- `timezone`: `America/Sao_Paulo`, `utc_offset_seconds`: -10800.
- Ponto de grade devolvido: -23.514938, -46.610504 (elevação 758 m) — a API ajusta para a célula do modelo mais próxima.
- `current` (08:00): `interval` 900 s, temperature_2m 21,6 °C, precipitation 0 mm, rain 0 mm, weather_code 1.
- `hourly`: 48 valores (2026-10-10T00:00 → 2026-10-11T23:00). Probabilidade de precipitação nas 6 primeiras horas: 37, 26, 12, 2, 1, 3 %.

Air Quality (`fixture-air-quality.json`):
- `timezone`: `America/Sao_Paulo`. Ponto de grade: -23.599998, -46.59999 (grade CAMS global, mais grossa).
- `current` (08:00): `interval` 3600 s, pm2_5 44,6 µg/m³, pm10 44,7 µg/m³, european_aqi 72, us_aqi 89.
- `hourly`: 48 valores, nenhum `null` em pm2_5, pm10, european_aqi, us_aqi, us_aqi_pm2_5.

## Mapa de campos (variáveis do projeto)

| API | Campo | Significado | Unidade (`*_units` da resposta) |
|---|---|---|---|
| Forecast | `hourly.precipitation` | Precipitação total (chuva, pancadas, neve) **somada na hora anterior** ao timestamp | `mm` |
| Forecast | `hourly.precipitation_probability` | Probabilidade de precipitação > 0,1 mm na hora anterior (derivada de ensemble) | `%` |
| Forecast | `current.precipitation` | Precipitação acumulada no intervalo `current.interval` (900 s = 15 min anteriores) | `mm` |
| Forecast | `current.rain` / `weather_code` / `temperature_2m` | Chuva; código WMO; temperatura a 2 m (auxiliares) | `mm`; `wmo code`; `°C` |
| Air Quality | `hourly.pm2_5` / `current.pm2_5` | Concentração de material particulado < 2,5 µm próximo à superfície | `μg/m³` |
| Air Quality | `hourly.us_aqi` / `current.us_aqi` | Índice de qualidade do ar dos EUA (máximo dos subíndices; PM usa média móvel de 24 h) | `USAQI` (0–500) |
| Air Quality | `hourly.us_aqi_pm2_5` | Subíndice US AQI só de PM2,5 | `USAQI` |
| Air Quality | `hourly.european_aqi` / `current.european_aqi` | Índice europeu (máximo dos subíndices; concentrações horárias) | `EAQI` (0–100+) |
| Ambas | `hourly.time` / `current.time` | Horário local em ISO 8601 sem offset (por causa de `timezone=America/Sao_Paulo`) | `iso8601` |

### `european_aqi` x `us_aqi`
A API oferece **ambos** (confirmado na resposta e na doc). Recomendação para o projeto: **`us_aqi`** (+ `pm2_5` bruto).
- Faixas US AQI (doc): 0–50 bom, 50–100 moderado, 100–150 insalubre para grupos sensíveis, etc. A escala 0–500 com 6 categorias é a mesma família adotada no Brasil (CONAMA 491/2018 / CETESB usam faixas parecidas — **não verificado** neste spike, só referência para discussão).
- Média móvel de 24 h para PM é mais estável para exibir no app que o EAQI horário.
- O EAQI tem faixas de 0–100 (bom, razoável, moderado, ruim, muito ruim; >100 extremamente ruim), pensado para a Europa.
- Para SP só existe o domínio `cams_global` (o `cams_europe` cobre apenas a Europa).

## Fuso horário
`timezone=America/Sao_Paulo` funcionou nas duas APIs (resposta com `utc_offset_seconds` -10800 e horários locais). Doc: o padrão é GMT; "Daylight saving time (DST) changes within the requested range are ignored" — SP não tem horário de verão atualmente, então não é problema; se precisar, usar `timeformat=unixtime`.

## Horizonte de previsão (conforme doc, consultada em 10/10/2026)
- Forecast: padrão 7 dias, máximo 16 dias (`forecast_days`). Usamos 2 dias no spike.
- Air Quality: padrão 5 dias, máximo 7 dias. Usamos 2 dias no spike.
- Não testamos os valores máximos na prática.

## CAMS (qualidade do ar) — conforme doc oficial
Fonte: https://open-meteo.com/en/docs/air-quality-api (consultada em 10/10/2026, via leitura da página — **confirmado na doc**):
- CAMS Global Atmospheric Composition Forecasts: resolução espacial **0,4° (~45 km)**, resolução temporal **3-horária** (a API entrega hora a hora; interpolação presumida — não verificado), atualização **a cada 12 horas**, previsão de **5 dias**.
- Consequência: o ponto da Sé caiu na célula -23.6, -46.6; o valor representa uma área grande, não uma estação local. Granularidade adequada para "a cidade", não para bairro.

Forecast (doc https://open-meteo.com/en/docs): `best_match` escolhe o melhor modelo para o local; "Current conditions are based on 15-minutely weather model data". Qual modelo é usado em SP e sua frequência de atualização **não foram confirmados** (a doc lista por provedor, ex.: ECMWF a cada 6 h, GFS a cada hora).

## Termos de uso / atribuição (consultado em 10/10/2026)
- https://open-meteo.com/en/terms — API gratuita só para uso **não comercial** (sem assinaturas nem anúncios); limites: < 10.000 chamadas/dia, 5.000/hora, 600/minuto, 300.000/mês. Sem chave de API, sem cartão.
- https://open-meteo.com/en/licence — dados sob **CC BY 4.0**; atribuição obrigatória com link junto de onde os dados forem exibidos, ex.: `<a href="https://open-meteo.com/">Weather data by Open-Meteo.com</a>`.
- Doc da Air Quality: "All users of Open-Meteo data must provide a clear attribution to CAMS ENSEMBLE data provider" além da referência ao Open-Meteo. Portanto o app deve exibir: "Dados meteorológicos: Open-Meteo.com (CC BY 4.0)" e "Qualidade do ar: Copernicus Atmosphere Monitoring Service (CAMS) via Open-Meteo".
- Projeto acadêmico, sem anúncios: enquadra-se como não comercial.
- Implicação: com cache no servidor, o volume do projeto fica muito abaixo dos limites.

## Critério de pronto da T03
**Atingido.**
- Fixtures reais salvos e com dados: `fixture-forecast.json` (48 h, current + hourly) e `fixture-air-quality.json` (48 h, sem nulos).
- Variáveis definidas: `hourly.precipitation` (mm), `hourly.precipitation_probability` (%), `current.precipitation` (mm/15 min), `pm2_5` (µg/m³), `us_aqi` (índice principal; `european_aqi` disponível como alternativa).

Pendências/dúvidas: latência da 1ª chamada (11,6 s) não explicada; modelo meteorológico usado pelo `best_match` em SP não confirmado; correspondência US AQI ↔ índice CETESB não verificada.
