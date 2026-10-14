// RF23: aba Mapa — trajetos salvos (o principal em destaque, na cor do último veredito; os
// outros esmaecidos), traçado do último briefing e faixa de 300 m de alagamento.
// Camadas filtráveis (alagamento, chuva, temperatura) de GET /v1/mapa/camadas, com impacto no veredito.
// Localização: se a permissão já existe, aparece sozinha; o botão "Mostrar minha posição" pede
// precisão alta, voa até a pessoa e mostra você → origem (a pé) e origem → destino (de carro), ambos por
// rota calculada (GET /v1/rota; nunca linha reta), só por ação da pessoa: as abas montam juntas.
// Filtro Trânsito (RF22): tiles da TomTom pelo proxy da API. Atalhos Uber/99 para o trajeto em destaque.
import type { LatLon } from '@kairos/contracts';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { Botao } from '@/components/botao';
import { useApiUrl } from '@/config/api';
import { AtalhosCorrida } from '@/features/atalhos/atalhos-corrida';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { pontosDasCamadas, precisaDeCamadas, useCamadasMapa, useFiltrosCamadas } from '@/features/map/camadas-mapa';
import { CartaoDistancias } from '@/features/map/cartao-distancias';
import { SEM_ROTAS } from '@/features/map/html-do-mapa';
import { FiltrosCamadas } from '@/features/map/filtros-camadas';
import { AVISO_APROXIMADA, obterPosicaoPrecisa } from '@/features/map/localizacao-precisa';
import { MapWebView } from '@/features/map/map-web-view';
import { useRota } from '@/features/map/use-rota';
import { useBriefingsDosTrajetos } from '@/features/map/use-briefings-dos-trajetos';
import { obterLocalizacaoSePermitida } from '@/features/trajetos/obter-localizacao';
import { trajetoPrincipal } from '@/features/trajetos/storage';
import { useTrajetos } from '@/features/trajetos/use-trajetos';
import { feedbackTatil } from '@/shared/feedback-tatil';
import { spacing, useColors } from '@/theme';

export default function MapaScreen() {
  const c = useColors();
  const reduzido = useReducedMotion();
  const { data: trajetos = [] } = useTrajetos();
  const principal = trajetoPrincipal(trajetos);
  const briefings = useBriefingsDosTrajetos(trajetos);
  const [localizacao, setLocalizacao] = useState<LatLon | null>(null);
  const [resolvida, setResolvida] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aproximada, setAproximada] = useState(false);
  /** Quantas vezes a pessoa pediu a posição (1º = voa no carregamento; seguintes = voa de novo). */
  const [focoSeq, setFocoSeq] = useState(0);
  const [filtros, alternarFiltro] = useFiltrosCamadas();
  const camadas = useCamadasMapa(precisaDeCamadas(filtros));
  const apiUrl = useApiUrl();
  const transitoUrl = filtros.includes('transito') ? `${apiUrl}/v1/mapa/transito/{z}/{x}/{y}.png` : null;
  const focado = focoSeq > 0;
  const origem = principal?.trajeto.origem ?? null;
  const aPe = useRota(localizacao, origem, 'a-pe', focado);
  const carro = useRota(origem, principal?.trajeto.destino ?? null, 'carro', focado);
  const rotasMapa = useMemo(
    () => (aPe.data || carro.data ? { aPe: aPe.data?.coordenadas ?? null, carro: carro.data?.coordenadas ?? null } : SEM_ROTAS),
    [aPe.data, carro.data]
  );
  const pontosCamadas = useMemo(
    () => (camadas.data ? pontosDasCamadas(camadas.data, filtros) : []),
    [camadas.data, filtros]
  );

  useEffect(() => {
    let ativo = true;
    obterLocalizacaoSePermitida().then((ponto) => {
      if (ativo) {
        setLocalizacao(ponto);
        setResolvida(true);
      }
    });
    return () => {
      ativo = false;
    };
  }, []);

  async function mostrarPosicao() {
    const r = await obterPosicaoPrecisa();
    if (r.ok) {
      feedbackTatil.sucesso();
      setLocalizacao(r.ponto);
      setAproximada(r.aproximada);
      setAviso(null);
      setFocoSeq((n) => n + 1);
    } else {
      feedbackTatil.erro();
      setAviso(r.mensagem);
    }
  }

  const n = trajetos.length;
  return (
    <Screen
      rotulo="Mapa"
      title={principal ? principal.nome : 'São Paulo'}
      subtitulo={
        n === 0
          ? 'Cadastre um trajeto para vê-lo no mapa'
          : n === 1
            ? 'Seu trajeto, com a faixa de 300 m de alagamento'
            : `Em destaque o principal; os outros ${n - 1} esmaecidos`
      }
      semRolagem
    >
      <FiltrosCamadas
        filtros={filtros}
        onAlternar={alternarFiltro}
        dados={camadas.data}
        carregando={camadas.isFetching}
        erro={camadas.error ? camadas.error.message : null}
      />
      {resolvida ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.xs,
            backgroundColor: c.surface,
            borderTopWidth: 1,
            borderTopColor: c.separator,
          }}
        >
          <ThemedText variant="caption" tone="textSecondary" style={{ flex: 1 }} accessibilityLiveRegion="polite">
            {aviso ??
              (localizacao
                ? 'Sua posição aparece no mapa. Toque para centralizar e ver as distâncias.'
                : 'Sua posição não aparece: o app ainda não tem permissão de localização.')}
          </ThemedText>
          <Botao
            titulo="Mostrar minha posição"
            icone="localizacao"
            tamanho="sm"
            variante="texto"
            tatil={false}
            avisoProcessando="Localizando…"
            onPress={mostrarPosicao}
          />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <MapWebView
          localizacao={localizacao}
          trajetos={trajetos}
          briefings={briefings}
          destaqueId={principal?.id}
          reduzirMovimento={reduzido}
          pontosCamadas={pontosCamadas}
          focoSeq={focoSeq}
          rotasMapa={rotasMapa}
          transitoUrl={transitoUrl}
        />
        {focoSeq > 0 && localizacao ? (
          <View style={{ position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg }}>
            <CartaoDistancias
              key={focoSeq}
              aPe={principal ? { rota: aPe.data, carregando: aPe.isFetching } : null}
              carro={principal ? { rota: carro.data, carregando: carro.isFetching } : null}
              nomeTrajeto={principal?.nome ?? null}
              aviso={aproximada ? AVISO_APROXIMADA : null}
              onTentarDeNovo={() => Promise.all([aPe.refetch(), carro.refetch()])}
            />
          </View>
        ) : null}
      </View>
      {principal ? (
        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.sm,
            backgroundColor: c.surface,
            borderTopWidth: 1,
            borderTopColor: c.separator,
          }}
        >
          <AtalhosCorrida origem={principal.trajeto.origem} destino={principal.trajeto.destino} />
        </View>
      ) : null}
    </Screen>
  );
}
