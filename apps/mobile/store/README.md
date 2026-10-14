# Material da loja (Google Play)

| Arquivo | O que é | Estado |
|---|---|---|
| `ficha-google-play.md` | Título, descrição curta e completa em pt-BR | Rascunho; limites conferidos |
| `feature-graphic.png` | Gráfico de recursos 1024×500 (PNG 24 bits, sem alfa) | Pronto |
| `icon-512.png` | Ícone de alta resolução 512×512 (sandália alada, verde e ouro) | Pronto (PNG RGB; se o Console exigir 32 bits com alfa, reexporte) |

Marca (14/10/2026): sandália alada (talária de Hermes), vetorizada da arte do grupo. Fonte única:
`../assets/brand/sandalia-alada.svg`. Todas as imagens (ícone, ícone adaptativo do Android, monocromático,
splash, favicon, `icon-512.png`, `feature-graphic.png` e a variante secundária
`../assets/brand/icone-secundario-1024.png`) saem de:

```sh
cd apps/mobile && node scripts/gerar-marca.mjs
```

Cores: padrão **verde obsidiana #102923 + ouro antigo #BA9650**; secundária **marfim #F5F0E6 + dourado
#B88A2D**. No ícone adaptativo e no splash, o símbolo ocupa 52 % do lado para caber no círculo que o
Android 12+ recorta (área segura de 66 %). O script usa caminho ABSOLUTO no `--screenshot` (no Windows o
Chrome headless ignora caminho relativo).

## O que falta antes de publicar

1. **Capturas reais do celular** (mín. 2, recomendadas 4–8; proporção entre 16:9 e 9:16, lado entre 320 e 3840 px):
   Trajetos, Novo trajeto, Briefing (um veredito real), Provedores.
2. **Política de privacidade** publicada numa URL (obrigatória porque o app pede localização):
   dizer que os trajetos ficam só no aparelho e que a localização só é lida ao tocar em
   "Usar minha localização".
3. Questionário de classificação de conteúdo, público-alvo e "Segurança dos dados" no Play Console.
4. Conta de desenvolvedor Google Play (taxa única) — fora do escopo "sem cartão" do projeto;
   decisão do grupo.
5. API acessível pela internet: o perfil `production` herda `EXPO_PUBLIC_API_URL` do `preview`
   (IP da rede local), que não funciona fora de casa.
6. ARTESP em uso desde 13/10/2026 (linhas 4–9): a licença é CC BY-NC 4.0 (atribuição obrigatória, uso
   NÃO comercial). A ficha já credita a fonte; publicar na loja só faz sentido com o app gratuito e sem
   anúncios — decisão do grupo antes de qualquer envio.
