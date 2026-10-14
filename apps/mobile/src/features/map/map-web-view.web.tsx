// RF23 na web (desenvolvimento e capturas): iframe com o mesmo HTML do WebView nativo.
// Web ≠ Android: serve para revisão visual, não para a loja. O iframe srcDoc tem a mesma origem da
// página, então camadas, rotas, trânsito e o "focar" são chamados direto na janela dele (sem recarregar).
import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import type { PontoCamada } from './camadas-mapa';
import { htmlDoMapa, SEM_ROTAS, type RotasMapa } from './html-do-mapa';
import type { MapWebViewNativoProps } from './map-web-view';

type RotasLatLon = { aPe: [number, number][] | null; carro: [number, number][] | null };

type JanelaMapa = Window & {
  kairosAtualizar?: (p: PontoCamada[]) => void;
  kairosRotas?: (r: RotasLatLon) => void;
  kairosTransito?: (url: string | null) => void;
  kairosFocar?: () => void;
};

const SEM_PONTOS: PontoCamada[] = [];

/** Mesma conversão de scriptRotas: [lon, lat] → [lat, lon], e nada com menos de 2 pontos. */
const latLon = (r: RotasMapa): RotasLatLon => {
  const ll = (c: [number, number][] | null) =>
    c && c.length >= 2 ? c.map(([lon, lat]) => [lat, lon] as [number, number]) : null;
  return { aPe: ll(r.aPe), carro: ll(r.carro) };
};

export function MapWebView({
  pontosCamadas = SEM_PONTOS,
  focoSeq = 0,
  rotasMapa = SEM_ROTAS,
  transitoUrl = null,
  ...props
}: MapWebViewNativoProps) {
  const ref = useRef<HTMLIFrameElement>(null);
  const janela = () => ref.current?.contentWindow as JanelaMapa | null | undefined;

  useEffect(() => {
    janela()?.kairosAtualizar?.(pontosCamadas);
  }, [pontosCamadas]);

  useEffect(() => {
    janela()?.kairosRotas?.(latLon(rotasMapa));
  }, [rotasMapa]);

  useEffect(() => {
    janela()?.kairosTransito?.(transitoUrl);
  }, [transitoUrl]);

  useEffect(() => {
    if (focoSeq > 1) janela()?.kairosFocar?.();
  }, [focoSeq]);

  return (
    <View style={{ flex: 1 }} accessibilityLabel="Mapa de São Paulo com os trajetos salvos">
      <iframe
        ref={ref}
        srcDoc={htmlDoMapa({ ...props, focar: props.focar || focoSeq > 0 })}
        title="Mapa de São Paulo"
        onLoad={() => {
          janela()?.kairosAtualizar?.(pontosCamadas);
          janela()?.kairosRotas?.(latLon(rotasMapa));
          janela()?.kairosTransito?.(transitoUrl);
        }}
        style={{ border: 0, width: '100%', height: '100%' }}
      />
    </View>
  );
}
