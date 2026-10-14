// RF23: o mapa injeta os trajetos no HTML (Leaflet/OSM) e centra em São Paulo
// quando não há localização. O WebView nativo é mockado (não roda no Jest); o mock guarda o HTML,
// o onLoadEnd e o que foi injetado por injectJavaScript.
import { act, render, screen } from '@testing-library/react-native';
import { Linking, View } from 'react-native';

import { FIXTURES_BRIEFING } from '@/features/briefing/fixtures';
import type { PontoCamada } from '@/features/map/camadas-mapa';
import { htmlDoMapa, CENTRO_SP, scriptAtualizar, scriptRotas, scriptTransito } from '@/features/map/html-do-mapa';
import { MapWebView, permitirNavegacao } from '@/features/map/map-web-view';
import type { TrajetoSalvo } from '@/features/trajetos/storage';

const mockWv = { html: '', cargas: 0, onLoadEnd: () => {}, injetados: [] as string[] };
jest.mock('react-native-webview', () => {
  const { View: V } = require('react-native');
  const { forwardRef, useImperativeHandle } = require('react');
  return {
    WebView: forwardRef(function WebView(props:{ source: { html: string }; onLoadEnd: () => void }, ref: unknown) {
      useImperativeHandle(ref, () => ({ injectJavaScript: (s: string) => mockWv.injetados.push(s) }));
      if (props.source.html !== mockWv.html) mockWv.cargas++;
      mockWv.html = props.source.html;
      mockWv.onLoadEnd = props.onLoadEnd;
      return <V testID="webview" />;
    }),
  };
});

const trajeto: TrajetoSalvo = {
  id: 't1',
  nome: 'Casa → Trabalho',
  criadoEm: '2026-10-10T08:00:00-03:00',
  atualizadoEm: '2026-10-10T08:00:00-03:00',
  trajeto: {
    origem: { lat: -23.561, lon: -46.655, rotulo: 'Av. Paulista' },
    destino: { lat: -23.533, lon: -46.634, rotulo: 'Sé' },
    onibus: [],
    trilhos: [],
  },
};

const PONTO: PontoCamada = { camada: 'chuva', lat: -23.55, lon: -46.63, etiqueta: '0,0 mm/h', cor: '#1F6B4E', detalhe: 'Sé' };

describe('htmlDoMapa', () => {
  it('sem permissão: centra em São Paulo e não marca "você está aqui"', async () => {
    const html = htmlDoMapa({ localizacao: null, trajetos: [] });
    expect(html).toContain(`"centro":{"lat":${CENTRO_SP.lat},"lon":${CENTRO_SP.lon}}`);
    expect(html).toContain('"localizacao":null');
    expect(html).toContain('OpenStreetMap contributors'); // atribuição obrigatória
  });

  it('injeta origem e destino dos trajetos salvos, com rótulos', async () => {
    const html = htmlDoMapa({ localizacao: { lat: -23.5, lon: -46.6 }, trajetos: [trajeto] });
    expect(html).toContain('Casa → Trabalho · origem: Av. Paulista');
    expect(html).toContain('Casa → Trabalho · destino: Sé');
    expect(html).toContain('"localizacao":{"lat":-23.5,"lon":-46.6}');
  });

  it('com briefing em cache: injeta a geometria ([lon,lat] → [lat,lon]), alagamentos e legenda', async () => {
    const base = FIXTURES_BRIEFING.find((f) => f.briefing.veredito === 'AGUARDAR')!.briefing;
    const briefing = {
      ...base,
      geometria: {
        fonte: 'osrm' as const,
        coordenadas: [
          [-46.655, -23.561],
          [-46.64, -23.55],
          [-46.634, -23.533],
        ] as [number, number][],
      },
    };
    const html = htmlDoMapa({ localizacao: null, trajetos: [trajeto], briefings: { t1: briefing } });
    expect(html).toContain('"pontos":[[-23.561,-46.655],[-23.55,-46.64],[-23.533,-46.634]]');
    expect(html).toContain('Casa → Trabalho · 1 ponto histórico de alagamento a até 300 m');
    expect(html).toContain('"raioM":300,"alagamentos":1');
    expect(html).toContain('Trajeto (cor do último veredito)');
    expect(html).toContain('"cor":"#730F1F"'); // cor do veredito AGUARDAR
    expect(html).toContain('aria-expanded="false"'); // legenda começa recolhida (não cobre o mapa)
  });

  it('com 2 trajetos: o em destaque fica marcado e o outro esmaecido', async () => {
    const outro = { ...trajeto, id: 't2', nome: 'Rolê' };
    const html = htmlDoMapa({ localizacao: null, trajetos: [trajeto, outro], destaqueId: 't2' });
    expect(html).toContain('"rotulo":"Casa → Trabalho · origem: Av. Paulista","tipo":"origem","destaque":false');
    expect(html).toContain('"rotulo":"Rolê · origem: Av. Paulista","tipo":"origem","destaque":true');
  });

  it('briefing sem coordenadas (linha reta sem pontos): só origem/destino', async () => {
    const base = FIXTURES_BRIEFING[0].briefing;
    const html = htmlDoMapa({ localizacao: null, trajetos: [trajeto], briefings: { t1: base } });
    expect(html).toContain('"rotas":[]');
    expect(html).toContain('Casa → Trabalho · origem: Av. Paulista');
  });

  it('escapa HTML nos rótulos (nome vem do usuário)', async () => {
    const malicioso = {
      ...trajeto,
      nome: '<img src=x onerror=alert(1)>',
    };
    const html = htmlDoMapa({ localizacao: null, trajetos: [malicioso] });
    expect(html).not.toContain('<img src=x');
  });

  it('focar: marcador pulsante e voo até a pessoa; nenhuma ligação em linha reta (14/10/2026)', async () => {
    const html = htmlDoMapa({ localizacao: { lat: -23.5, lon: -46.6 }, trajetos: [trajeto], focar: true });
    expect(html).toContain('"focar":true');
    expect(html).not.toContain('ligacao');
    expect(html).not.toMatch(/linha reta/i);
    expect(html).toContain('@keyframes pulso');
    expect(html).toContain('mapa.flyTo(alvo, 16');
    expect(html).toContain('if (DADOS.focar) window.kairosFocar();');
  });

  it('movimento reduzido vai para os dados (sem pulso nem voo)', async () => {
    const reduzido = htmlDoMapa({ localizacao: { lat: -23.5, lon: -46.6 }, trajetos: [trajeto], focar: true, reduzirMovimento: true });
    expect(reduzido).toContain('"reduzirMovimento":true');
  });

  it('regressão 14/10: geometria "linha-reta" do servidor NÃO é desenhada como rota', async () => {
    const base = FIXTURES_BRIEFING[0].briefing;
    const briefing = { ...base, geometria: { fonte: 'linha-reta' as const, coordenadas: [[-46.655, -23.561], [-46.634, -23.533]] as [number, number][] } };
    const html = htmlDoMapa({ localizacao: null, trajetos: [trajeto], briefings: { t1: briefing } });
    expect(html).toContain('"rotas":[]');
  });

  it('scriptRotas: [lon,lat] → [lat,lon]; menos de 2 pontos = nada (nunca liga pontos soltos)', () => {
    expect(scriptRotas({ aPe: [[-46.6, -23.5], [-46.65, -23.56]], carro: [[-46.6, -23.5]] })).toBe(
      'window.kairosRotas && window.kairosRotas({"aPe":[[-23.5,-46.6],[-23.56,-46.65]],"carro":null}); true;'
    );
  });

  it('scriptTransito liga a camada com a URL do proxy ou desliga com null; HTML tem tiles com © TomTom', () => {
    expect(scriptTransito('http://api/v1/mapa/transito/{z}/{x}/{y}.png')).toContain('kairosTransito("http://api/v1/mapa/transito/{z}/{x}/{y}.png")');
    expect(scriptTransito(null)).toContain('kairosTransito(null)');
    const html = htmlDoMapa({ localizacao: null, trajetos: [] });
    expect(html).toContain("attribution: '&copy; TomTom'");
    expect(html).toContain('opacity: 0.7');
    expect(html).toContain('Você → origem (a pé)');
  });

  it('scriptAtualizar não deixa "<" fechar o script', () => {
    expect(scriptAtualizar([{ ...PONTO, detalhe: '</script>' }])).not.toContain('</script>');
  });
});

describe('permitirNavegacao', () => {
  it('link externo (atribuição) abre no navegador e não navega o WebView; HTML local passa', () => {
    const abrir = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    expect(permitirNavegacao({ url: 'https://leafletjs.com/', isTopFrame: true })).toBe(false);
    expect(abrir).toHaveBeenCalledWith('https://leafletjs.com/');
    expect(permitirNavegacao({ url: 'about:blank' })).toBe(true);
    expect(permitirNavegacao({ url: 'https://tile.openstreetmap.org/x', isTopFrame: false })).toBe(true);
    abrir.mockRestore();
  });
});

describe('MapWebView', () => {
  beforeEach(() => {
    mockWv.html = '';
    mockWv.cargas = 0;
    mockWv.injetados = [];
  });

  it('renderiza o WebView com o HTML do mapa', async () => {
    await render(
      <View>
        <MapWebView localizacao={null} trajetos={[trajeto]} />
      </View>
    );
    expect(screen.getByTestId('webview')).toBeTruthy();
    expect(mockWv.html).toContain('leaflet');
    expect(mockWv.html).toContain('Casa → Trabalho · origem: Av. Paulista');
  });

  it('camadas entram por injeção depois do load; trocar filtros NÃO recarrega o mapa', async () => {
    const ui = (pontos: PontoCamada[]) => <MapWebView localizacao={null} trajetos={[trajeto]} pontosCamadas={pontos} />;
    const { rerender } = await render(ui([PONTO]));
    expect(mockWv.injetados).toEqual([]); // antes do load não injeta
    await act(async () => mockWv.onLoadEnd());
    expect(mockWv.injetados[0]).toBe(scriptAtualizar([PONTO]));

    await rerender(ui([]));
    expect(mockWv.injetados.at(-1)).toBe(scriptAtualizar([]));
    expect(mockWv.cargas).toBe(1);
  });

  it('rotas e trânsito entram por injeção (no load e ao mudar), sem recarregar o mapa', async () => {
    const rotas = { aPe: [[-46.6, -23.5], [-46.65, -23.56]] as [number, number][], carro: null };
    const ui = (url: string | null) => (
      <MapWebView localizacao={null} trajetos={[trajeto]} rotasMapa={rotas} transitoUrl={url} />
    );
    const { rerender } = await render(ui(null));
    await act(async () => mockWv.onLoadEnd());
    expect(mockWv.injetados).toContain(scriptRotas(rotas));
    expect(mockWv.injetados).toContain(scriptTransito(null));
    await rerender(ui('http://x/{z}/{x}/{y}.png'));
    expect(mockWv.injetados.at(-1)).toBe(scriptTransito('http://x/{z}/{x}/{y}.png'));
    expect(mockWv.cargas).toBe(1);
  });

  it('1º pedido de posição liga "focar" no HTML; os seguintes só injetam o voo', async () => {
    const ui = (focoSeq: number) => (
      <MapWebView localizacao={{ lat: -23.5, lon: -46.6 }} trajetos={[trajeto]} focoSeq={focoSeq} />
    );
    const { rerender } = await render(ui(0));
    expect(mockWv.html).toContain('"focar":false');
    await act(async () => mockWv.onLoadEnd());
    await rerender(ui(1));
    expect(mockWv.html).toContain('"focar":true');
    expect(mockWv.injetados.some((s) => s.includes('kairosFocar'))).toBe(false);
    await rerender(ui(2));
    expect(mockWv.injetados.at(-1)).toContain('window.kairosFocar');
    expect(mockWv.cargas).toBe(2);
  });
});
