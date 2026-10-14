// Gera os PNGs da marca a partir de assets/brand/sandalia-alada.svg (fonte única) com o Chrome headless.
// Uso (em apps/mobile): node scripts/gerar-marca.mjs
// Cores (decisão do usuário, 14/10/2026): padrão = verde obsidiana #102923 + ouro antigo #BA9650;
// secundária = marfim #F5F0E6 + dourado #B88A2D.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MARCA = {
  padrao: { fundo: '#102923', simbolo: '#BA9650' },
  secundaria: { fundo: '#F5F0E6', simbolo: '#B88A2D' },
};

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const svgFonte = fs.readFileSync(path.join(raiz, 'assets/brand/sandalia-alada.svg'), 'utf8');
const viewBox = /viewBox="([^"]+)"/.exec(svgFonte)[1];
const d = /\sd="([^"]+)"/.exec(svgFonte)[1];

/** Símbolo dentro de uma caixa de `escala` (fração da menor dimensão), centrado. */
function simbolo(cor, escala) {
  return `<svg viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet"
    style="width:${escala * 100}%;height:${escala * 100}%"><path fill="${cor}" fill-rule="evenodd" d="${d}"/></svg>`;
}

function pagina(largura, altura, fundo, corpo) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:${largura}px;height:${altura}px;background:${fundo};overflow:hidden}
    .c{width:100%;height:100%;display:flex;align-items:center;justify-content:center}
  </style></head><body><div class="c">${corpo}</div></body></html>`;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kairos-marca-'));
function renderizar(destino, largura, altura, html, transparente) {
  const arquivo = path.join(tmp, path.basename(destino) + '.html');
  fs.writeFileSync(arquivo, html);
  const saida = path.resolve(raiz, destino); // caminho ABSOLUTO (relativo falha em silêncio no Windows)
  fs.mkdirSync(path.dirname(saida), { recursive: true });
  execFileSync(CHROME, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${largura},${altura}`,
    ...(transparente ? ['--default-background-color=00000000'] : []),
    `--screenshot=${saida}`,
    'file:///' + arquivo.replace(/\\/g, '/'),
  ], { stdio: 'ignore' });
  if (!fs.existsSync(saida)) throw new Error(`não gerou ${destino}`);
  console.log(`${destino} ${largura}x${altura}`);
}

const { padrao, secundaria } = MARCA;
// Ícone (iOS/legado e loja): fundo cheio, símbolo com respiro
renderizar('assets/images/icon.png', 1024, 1024, pagina(1024, 1024, padrao.fundo, simbolo(padrao.simbolo, 0.72)));
renderizar('store/icon-512.png', 512, 512, pagina(512, 512, padrao.fundo, simbolo(padrao.simbolo, 0.72)));
renderizar('assets/images/favicon.png', 48, 48, pagina(48, 48, padrao.fundo, simbolo(padrao.simbolo, 0.8)));
// Android adaptativo: o sistema recorta um círculo de ~66 % no centro — o símbolo cabe nessa área segura
renderizar('assets/images/android-icon-foreground.png', 1024, 1024,
  pagina(1024, 1024, 'transparent', simbolo(padrao.simbolo, 0.52)), true);
renderizar('assets/images/android-icon-monochrome.png', 1024, 1024,
  pagina(1024, 1024, 'transparent', simbolo('#FFFFFF', 0.52)), true);
// Splash: símbolo sobre o fundo do app.json (expo-splash-screen, imageWidth 200). No Android 12+ o splash
// também é recortado em círculo, então vale a mesma área segura do ícone adaptativo
renderizar('assets/images/splash-icon.png', 1024, 1024,
  pagina(1024, 1024, 'transparent', simbolo(padrao.simbolo, 0.52)), true);
// Variante secundária (marfim + dourado), para materiais claros
renderizar('assets/brand/icone-secundario-1024.png', 1024, 1024,
  pagina(1024, 1024, secundaria.fundo, simbolo(secundaria.simbolo, 0.72)));
// Gráfico de destaque da Google Play (1024x500)
renderizar('store/feature-graphic.png', 1024, 500, pagina(1024, 500, padrao.fundo, `
  <div style="display:flex;align-items:center;gap:56px;font-family:'Segoe UI',system-ui,sans-serif">
    <div style="width:340px;height:260px">${simbolo(padrao.simbolo, 1)}</div>
    <div style="color:${padrao.simbolo}">
      <div style="font-size:96px;font-weight:700;line-height:1">Καιρός</div>
      <div style="font-size:30px;line-height:1.35;margin-top:18px;color:${secundaria.fundo};max-width:460px">
        Sair agora ou esperar? Clima, ar e transporte do seu trajeto em São Paulo.</div>
    </div>
  </div>`));
fs.rmSync(tmp, { recursive: true, force: true });
