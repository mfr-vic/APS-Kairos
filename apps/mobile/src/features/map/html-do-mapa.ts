// RF23: mapa interativo num WebView com Leaflet + tiles OpenStreetMap.
// Google Maps SDK exige chave com billing (cartão) — viola a regra "só fontes gratuitas,
// sem cartão" do projeto; por isso Leaflet/OSM, com a atribuição obrigatória visível.
// Com briefing em cache, desenha a geometria do trajeto (RF24, [lon, lat]) e o raio de 300 m
// de busca de alagamento; sem briefing, só origem/destino.
import type { BriefingResponse, LatLon } from '@kairos/contracts';

import { VEREDITO } from '@/features/briefing/format';
import type { TrajetoSalvo } from '@/features/trajetos/storage';

import type { PontoCamada } from './camadas-mapa';

export const CENTRO_SP: LatLon = { lat: -23.5505, lon: -46.6333 };

export type MapWebViewProps = {
  /** Posição da pessoa, se a permissão já foi concedida; null centra em São Paulo. */
  localizacao: LatLon | null;
  trajetos: TrajetoSalvo[];
  /** Último briefing em cache por id de trajeto (geometria e alagamentos). */
  briefings?: Record<string, BriefingResponse | undefined>;
  /** Trajeto em destaque (o principal): rótulos fixos e cor do veredito; os outros esmaecem. */
  destaqueId?: string;
  /** Pessoa pediu "Mostrar minha posição": voa até ela (a rota até a origem entra por scriptRotas). */
  focar?: boolean;
  /** Movimento reduzido do sistema: sem pulso e sem voo (só reposiciona). */
  reduzirMovimento?: boolean;
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

type Rota = {
  rotulo: string;
  pontos: [number, number][];
  raioM: number | null;
  alagamentos: number;
  /** Cor do último veredito (mesma escala do app). */
  cor: string;
  destaque: boolean;
};

function rotaDoBriefing(t: TrajetoSalvo, b: BriefingResponse | undefined, destaque: boolean): Rota | null {
  const coords = b?.geometria.coordenadas;
  // Linha reta do servidor só serve para a busca de alagamento: não é rota e não é desenhada (14/10/2026).
  if (!b || b.geometria.fonte === 'linha-reta' || !coords || coords.length < 2) return null;
  const flood = b.observacoes.find((o) => o.dimension === 'flood');
  const fv = flood?.dimension === 'flood' ? flood.value : null;
  const n = fv?.pontos.length ?? 0;
  return {
    rotulo: esc(
      `${t.nome}${fv ? ` · ${n} ${n === 1 ? 'ponto histórico' : 'pontos históricos'} de alagamento a até ${fv.raioM} m` : ''}`
    ),
    // GeoJSON [lon, lat] → Leaflet [lat, lon]
    pontos: coords.map(([lon, lat]) => [lat, lon]),
    raioM: fv?.raioM ?? null,
    alagamentos: n,
    cor: VEREDITO[b.veredito].cor,
    destaque,
  };
}

/** JS injetado após o load: redesenha as camadas ligadas (sem recarregar o mapa). */
export function scriptAtualizar(pontos: readonly PontoCamada[]): string {
  return `window.kairosAtualizar && window.kairosAtualizar(${JSON.stringify(pontos).replace(/</g, '\\u003c')}); true;`;
}

/** Rotas de GET /v1/rota em [lon, lat]; null = sem rota (nada é desenhado, nunca linha reta). */
export type RotasMapa = { aPe: [number, number][] | null; carro: [number, number][] | null };
export const SEM_ROTAS: RotasMapa = { aPe: null, carro: null };

/** JS injetado: desenha a rota a pé (tracejada) e a de carro (só se o briefing não trouxe traçado). */
export function scriptRotas(r: RotasMapa): string {
  const ll = (c: [number, number][] | null) => (c && c.length >= 2 ? c.map(([lon, lat]) => [lat, lon]) : null);
  return `window.kairosRotas && window.kairosRotas(${JSON.stringify({ aPe: ll(r.aPe), carro: ll(r.carro) })}); true;`;
}

/** JS injetado: liga (url do proxy de tiles da API) ou desliga (null) a camada de trânsito. */
export function scriptTransito(url: string | null): string {
  return `window.kairosTransito && window.kairosTransito(${JSON.stringify(url).replace(/</g, '\\u003c')}); true;`;
}

/** JS injetado: voa de novo até a posição da pessoa. */
export function scriptFocar(): string {
  return 'window.kairosFocar && window.kairosFocar(); true;';
}

/** HTML autocontido (Leaflet via CDN); exportado para os testes. */
export function htmlDoMapa({
  localizacao,
  trajetos,
  briefings = {},
  destaqueId,
  focar = false,
  reduzirMovimento = false,
}: MapWebViewProps): string {
  // Sem destaque informado, todos os trajetos aparecem em destaque (nenhum esmaecido).
  const emDestaque = (t: TrajetoSalvo) => !destaqueId || t.id === destaqueId;
  const centro = localizacao ?? CENTRO_SP;
  const marcadores = trajetos.flatMap((t) => [
    { lat: t.trajeto.origem.lat, lon: t.trajeto.origem.lon, rotulo: esc(`${t.nome} · origem: ${t.trajeto.origem.rotulo}`), tipo: 'origem', destaque: emDestaque(t) },
    { lat: t.trajeto.destino.lat, lon: t.trajeto.destino.lon, rotulo: esc(`${t.nome} · destino: ${t.trajeto.destino.rotulo}`), tipo: 'destino', destaque: emDestaque(t) },
  ]);
  const rotas = trajetos
    .map((t) => rotaDoBriefing(t, briefings[t.id], emDestaque(t)))
    .filter((r) => r !== null);
  // "<" vira < para o JSON não fechar a tag <script>.
  const dados = JSON.stringify({ centro, localizacao, marcadores, rotas, focar, reduzirMovimento }).replace(
    /</g,
    '\\u003c'
  );

  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html, body, #mapa { margin: 0; height: 100%; background: #DFE9E5; }
  #falha { display: none; position: absolute; inset: 0; z-index: 1000; padding: 24px;
    align-items: center; justify-content: center; text-align: center; color: #0F261F;
    font-family: system-ui, sans-serif; font-size: 15px; background: #DFE9E5; }
  .legenda { background: #FFFFFF; color: #0F261F; border-radius: 8px;
    font: 13px/1.5 system-ui, sans-serif; box-shadow: 0 1px 3px rgba(15,38,31,.25); }
  .legenda button { all: unset; cursor: pointer; display: block; min-height: 44px; min-width: 44px;
    padding: 0 12px; line-height: 44px; font-weight: 600; }
  .legenda .itens { display: none; padding: 0 12px 10px; }
  .legenda.aberta .itens { display: block; }
  .legenda i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
  .legenda b { display: inline-block; width: 14px; height: 3px; margin-right: 6px; vertical-align: middle; background: #1F5748; }
  .rotulo-fixo { font: 600 12px system-ui, sans-serif; color: #0F261F; }
  .kairos-icone { background: none; border: 0; }
  /* "Você está aqui": ponto com pulso (desligado com movimento reduzido) */
  .voce { width: 22px; height: 22px; border-radius: 50%; background: #1F5748; border: 3px solid #FFFFFF;
    box-sizing: border-box; box-shadow: 0 0 0 2px rgba(15,38,31,.35); position: relative; }
  .voce::after { content: ''; position: absolute; left: -3px; top: -3px; width: 22px; height: 22px;
    border-radius: 50%; background: rgba(31,87,72,.45); animation: pulso 1.8s cubic-bezier(.23,1,.32,1) infinite; }
  .voce.parado::after { animation: none; opacity: 0; }
  @media (prefers-reduced-motion: reduce) { .voce::after { animation: none; opacity: 0; } }
  @keyframes pulso { from { transform: scale(1); opacity: .8; } to { transform: scale(3.4); opacity: 0; } }
  /* Valores das camadas (chuva acima do ponto, temperatura abaixo) */
  .etiqueta { position: absolute; transform: translateX(-50%); white-space: nowrap; color: #FFFFFF;
    font: 600 12px/1 system-ui, sans-serif; padding: 5px 8px; border-radius: 999px;
    box-shadow: 0 1px 3px rgba(15,38,31,.3); }
  .etiqueta.chuva { top: -30px; }
  .etiqueta.temperatura { top: 8px; }
</style>
</head><body>
<div id="mapa"></div>
<div id="falha">Sem conexão. O mapa precisa de internet para carregar.</div>
<script>
  var DADOS = ${dados};
  function falha() { var f = document.getElementById('falha'); f.style.display = 'flex'; }
  if (!window.L) { falha(); } else {
    var mapa = L.map('mapa').setView([DADOS.centro.lat, DADOS.centro.lon], 12);
    var tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(mapa);
    var falhouTile = false;
    tiles.on('tileerror', function () { if (!falhouTile) { falhouTile = true; falha(); } });
    tiles.on('load', function () { falhouTile = false; document.getElementById('falha').style.display = 'none'; });
    var limites = [];
    DADOS.rotas.forEach(function (r) {
      // Trajeto em destaque na cor do último veredito; os outros esmaecidos.
      var opac = r.destaque ? 0.9 : 0.35;
      if (r.raioM) {
        // Faixa de busca de alagamento (raio em metros ao redor do trajeto), mais forte se houver pontos.
        L.polyline(r.pontos, { color: r.alagamentos > 0 ? '#730F1F' : '#1F5748', opacity: r.destaque ? 0.15 : 0.06,
          weight: 24, lineCap: 'round' }).addTo(mapa);
      }
      L.polyline(r.pontos, { color: r.cor, weight: r.destaque ? 6 : 4, opacity: opac }).addTo(mapa).bindTooltip(r.rotulo);
      if (r.destaque) limites = limites.concat(r.pontos);
    });
    // Camadas filtráveis: o app injeta os pontos (kairosAtualizar) sem recarregar o mapa.
    var grupoCamadas = L.layerGroup().addTo(mapa);
    window.kairosAtualizar = function (pontos) {
      grupoCamadas.clearLayers();
      pontos.forEach(function (p) {
        var mk = p.etiqueta
          ? L.marker([p.lat, p.lon], { keyboard: false, icon: L.divIcon({ className: 'kairos-icone', iconSize: null,
              html: '<span class="etiqueta ' + p.camada + '" style="background:' + p.cor + '">' + p.etiqueta + '</span>' }) })
          : L.circleMarker([p.lat, p.lon], { radius: 6, color: '#FFFFFF', weight: 1.5, fillColor: p.cor, fillOpacity: 0.85 });
        mk.bindPopup(p.detalhe).addTo(grupoCamadas);
      });
    };
    // Rotas calculadas pela API (você → origem a pé; origem → destino de carro se o briefing não trouxe traçado).
    var grupoRotas = L.layerGroup().addTo(mapa);
    var temTracado = DADOS.rotas.some(function (r) { return r.destaque; });
    window.kairosRotas = function (r) {
      grupoRotas.clearLayers();
      if (r.carro && !temTracado) L.polyline(r.carro, { color: '#0F261F', weight: 5, opacity: 0.85 }).addTo(grupoRotas).bindTooltip('Origem → destino (rota de carro)');
      if (r.aPe) L.polyline(r.aPe, { color: '#1F5748', weight: 4, dashArray: '2 8', lineCap: 'round', opacity: 0.95 }).addTo(grupoRotas).bindTooltip('Você → origem (a pé)');
    };
    // Trânsito ao vivo: tiles da TomTom pelo proxy da API (a chave fica no servidor).
    var transito = null;
    window.kairosTransito = function (url) {
      if (transito) { mapa.removeLayer(transito); transito = null; }
      if (url) transito = L.tileLayer(url, { maxZoom: 19, opacity: 0.7, attribution: '&copy; TomTom' }).addTo(mapa);
    };
    if (DADOS.localizacao) {
      var aqui = [DADOS.localizacao.lat, DADOS.localizacao.lon];
      L.marker(aqui, { keyboard: false, zIndexOffset: 1000, icon: L.divIcon({ className: 'kairos-icone',
        iconSize: [22, 22], iconAnchor: [11, 11], html: '<div class="voce' + (DADOS.reduzirMovimento ? ' parado' : '') + '"></div>' }) })
        .addTo(mapa).bindTooltip('Você está aqui');
    }
    window.kairosFocar = function () {
      if (!DADOS.localizacao) return;
      var alvo = [DADOS.localizacao.lat, DADOS.localizacao.lon];
      if (DADOS.reduzirMovimento) mapa.setView(alvo, 16); else mapa.flyTo(alvo, 16, { duration: 1.2 });
    };
    DADOS.marcadores.forEach(function (m) {
      var mk = L.circleMarker([m.lat, m.lon], {
        radius: m.destaque ? 8 : 6, color: '#FFFFFF', weight: 2,
        fillColor: m.tipo === 'origem' ? '#0F261F' : '#730F1F', fillOpacity: m.destaque ? 1 : 0.45,
        opacity: m.destaque ? 1 : 0.6
      }).addTo(mapa);
      // Rótulo fixo (de qual trajeto é o ponto) só no trajeto em destaque; nos outros, ao tocar.
      mk.bindTooltip(m.rotulo, m.destaque ? { permanent: true, direction: 'top', offset: [0, -8], className: 'rotulo-fixo' } : {});
      if (m.destaque) limites.push([m.lat, m.lon]);
    });
    if (limites.length > 1) mapa.fitBounds(limites, { padding: [48, 48] });
    // Legenda recolhida por padrão (não cobre o mapa); abre ao tocar.
    var legenda = L.control({ position: 'topright' });
    legenda.onAdd = function () {
      var d = L.DomUtil.create('div', 'legenda');
      d.innerHTML = '<button type="button" aria-expanded="false">Legenda</button><div class="itens">' +
        '<i style="background:#0F261F"></i>Origem<br><i style="background:#730F1F"></i>Destino' +
        '<br><b style="background:repeating-linear-gradient(90deg,#1F5748 0 3px,transparent 3px 7px)"></b>Você → origem (a pé)' +
        (DADOS.rotas.length ? '<br><b></b>Trajeto (cor do último veredito)<br><b style="height:8px;opacity:.3;background:#730F1F"></b>Faixa de 300 m com alagamento' : '') +
        '</div>';
      var btn = d.querySelector('button');
      L.DomEvent.disableClickPropagation(d);
      btn.addEventListener('click', function () {
        var aberta = d.classList.toggle('aberta');
        btn.setAttribute('aria-expanded', String(aberta));
      });
      return d;
    };
    legenda.addTo(mapa);
    if (DADOS.focar) window.kairosFocar();
  }
</script>
</body></html>`;
}
