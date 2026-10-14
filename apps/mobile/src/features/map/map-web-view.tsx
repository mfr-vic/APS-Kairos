// RF23: superfície nativa do mapa (react-native-webview). Na web, ver map-web-view.web.tsx.
// Camadas, rotas, trânsito e "focar em mim" entram por injectJavaScript: ligar um filtro ou recentrar
// NÃO recarrega o mapa (recarregar piscaria os tiles e perderia o zoom da pessoa).
import { useEffect, useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { EstadoTela } from '@/components/estado-tela';
import { ACOES } from '@/shared/textos';
import { spacing } from '@/theme';

import type { PontoCamada } from './camadas-mapa';
import {
  htmlDoMapa,
  scriptAtualizar,
  scriptFocar,
  scriptRotas,
  scriptTransito,
  SEM_ROTAS,
  type MapWebViewProps,
  type RotasMapa,
} from './html-do-mapa';

export type MapWebViewNativoProps = MapWebViewProps & {
  pontosCamadas?: PontoCamada[];
  /** Cada incremento recentra na pessoa (depois do 1º, que já vem no HTML via `focar`). */
  focoSeq?: number;
  /** Rotas de GET /v1/rota (a pé e de carro). */
  rotasMapa?: RotasMapa;
  /** URL dos tiles de trânsito do proxy da API; null = camada desligada. */
  transitoUrl?: string | null;
};

const SEM_PONTOS: PontoCamada[] = [];

/**
 * Links da atribuição ("Leaflet", "OpenStreetMap") navegariam o próprio WebView e prenderiam a
 * aba fora do mapa: abrem no navegador do sistema. O HTML local segue liberado.
 */
export function permitirNavegacao(req: { url: string; isTopFrame?: boolean }): boolean {
  if (req.isTopFrame !== false && /^https?:\/\//i.test(req.url)) {
    Linking.openURL(req.url).catch(() => {});
    return false;
  }
  return true;
}

export function MapWebView({
  pontosCamadas = SEM_PONTOS,
  focoSeq = 0,
  rotasMapa = SEM_ROTAS,
  transitoUrl = null,
  ...props
}: MapWebViewNativoProps) {
  const [erro, setErro] = useState(false);
  const ref = useRef<WebView>(null);
  const carregado = useRef(false);
  /** Último estado injetável, para o onLoadEnd de uma recarga (ex.: chegou a posição) redesenhar tudo. */
  const ultimo = useRef({ pontosCamadas, rotasMapa, transitoUrl });
  const html = htmlDoMapa({ ...props, focar: props.focar || focoSeq > 0 });

  useEffect(() => {
    ultimo.current.pontosCamadas = pontosCamadas;
    if (carregado.current) ref.current?.injectJavaScript(scriptAtualizar(pontosCamadas));
  }, [pontosCamadas]);

  useEffect(() => {
    ultimo.current.rotasMapa = rotasMapa;
    if (carregado.current) ref.current?.injectJavaScript(scriptRotas(rotasMapa));
  }, [rotasMapa]);

  useEffect(() => {
    ultimo.current.transitoUrl = transitoUrl;
    if (carregado.current) ref.current?.injectJavaScript(scriptTransito(transitoUrl));
  }, [transitoUrl]);

  useEffect(() => {
    // O 1º pedido liga `focar` no HTML (recarrega e voa); os seguintes só voam de novo.
    if (carregado.current && focoSeq > 1) ref.current?.injectJavaScript(scriptFocar());
  }, [focoSeq]);

  if (erro) {
    return (
      <View style={{ padding: spacing.lg }}>
        <EstadoTela
          tipo="erro"
          icone="mapa"
          titulo="O mapa não carregou"
          texto="O mapa base (OpenStreetMap) precisa de internet. Seus trajetos continuam salvos."
          acao={{ rotulo: ACOES.tentarDeNovo, onPress: () => setErro(false), icone: 'atualizar' }}
        />
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }} accessibilityLabel="Mapa de São Paulo com os trajetos salvos">
      <WebView
        ref={ref}
        source={{ html }}
        originWhitelist={['*']}
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={permitirNavegacao}
        onLoadStart={() => {
          carregado.current = false;
        }}
        onLoadEnd={() => {
          carregado.current = true;
          const u = ultimo.current;
          ref.current?.injectJavaScript(scriptAtualizar(u.pontosCamadas));
          ref.current?.injectJavaScript(scriptRotas(u.rotasMapa));
          ref.current?.injectJavaScript(scriptTransito(u.transitoUrl));
        }}
        onError={() => setErro(true)}
        style={{ flex: 1 }}
      />
    </View>
  );
}
