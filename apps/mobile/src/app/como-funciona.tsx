// "Como o Καιρός funciona" (item 9, 13/10): a narrativa de Sistemas Distribuídos amarrada aos dados
// vivos — o caminho de um briefing (celular → API → 7 fontes) com o estado e a latência medidos
// agora, e os conceitos de SD que o Καιρός aplica, cada um com o arquivo que o implementa.
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Botao } from '@/components/botao';
import { Icon, type IconName } from '@/components/icon';
import { IconeEmBloco } from '@/components/icone-em-bloco';
import { ListRow } from '@/components/list-row';
import { ListSection } from '@/components/list-section';
import { StackScreen } from '@/components/stack-screen';
import { StatusDot } from '@/components/status-dot';
import { ThemedText } from '@/components/themed-text';
import { useSaudeDoSistema } from '@/features/provedores/use-saude-do-sistema';
import { CONCEITOS_SD } from '@/features/sobre/conceitos-sd';
import { estadoDoNo, NOS_DO_SISTEMA, TEXTO_ESTADO } from '@/features/sobre/nos-do-sistema';
import { resumirRegistro, useRegistro } from '@/shared/api/registro';
import { spacing, useColors } from '@/theme';
import { useNavegacao } from '@/shared/navegacao/use-navegacao';

export default function ComoFuncionaScreen() {
  const nav = useNavegacao();
  const { health, providers, atualizar } = useSaudeDoSistema();
  const resumo = resumirRegistro(useRegistro());
  const briefings = resumo.porRota.find((r) => r.rota === '/v1/briefings');
  const lista = providers.data?.providers;

  return (
    <StackScreen title="Como o Καιρός funciona" onRefresh={atualizar}>
      <View style={{ gap: spacing.sm }}>
        <ThemedText variant="title" accessibilityRole="header">
          Um sistema distribuído no seu bolso
        </ThemedText>
        <ThemedText variant="body" tone="textSecondary">
          O celular não fala com nenhuma fonte. Ele pergunta à API do Καιρός, que consulta 7 fontes
          independentes em paralelo: clima, ar, ônibus, trilhos, rotas e alagamento. Cada fonte pode
          falhar sozinha, e o veredito sai mesmo assim. Cada dimensão diz se o dado está atual,
          desatualizado ou indisponível.
        </ThemedText>
      </View>

      <ListSection titulo="1 · Este celular" rodape="Medido no app: ida e volta até a API, desde que o app abriu.">
        <No icone="localizacao" titulo="App Καιρός (Expo)" texto="Guarda trajetos e o último briefing; funciona sem rede.">
          <ThemedText variant="subheadStrong" selectable>
            {resumo.taxaSucesso === null ? 'sem requisições' : `${resumo.taxaSucesso}% ok`}
          </ThemedText>
        </No>
        {briefings ? (
          <ListRow>
            <ThemedText variant="subhead" tone="textSecondary" style={{ flex: 1 }}>
              Briefings pedidos
            </ThemedText>
            <ThemedText variant="subheadStrong" selectable>
              {briefings.total}× · média {briefings.latenciaMediaMs} ms
            </ThemedText>
          </ListRow>
        ) : null}
      </ListSection>

      <Seta />

      <ListSection titulo="2 · API Καιρός (servidor)" rodape="Orquestra as fontes: prazo, cache, circuit breaker e limites de taxa.">
        <No icone="provedores" titulo="Fastify + Node" texto="Junta as 5 dimensões, aplica as regras e devolve o veredito.">
          <StatusDot
            tom={health.error ? 'erro' : health.data ? 'ok' : 'neutro'}
            texto={health.error ? 'sem resposta' : health.data ? `${health.data.latencyMs} ms` : 'consultando'}
          />
        </No>
      </ListSection>

      <Seta />

      <ListSection
        titulo="3 · Fontes externas (7)"
        rodape="Estado e última latência medidos pelo servidor desde que a API subiu."
      >
        {NOS_DO_SISTEMA.map((no) => {
          const { status, latencyMs } = estadoDoNo(no, lista);
          const estado = TEXTO_ESTADO[status];
          return (
            <No key={no.id} icone={no.icone} titulo={no.nome} texto={no.papel}>
              <View style={{ alignItems: 'flex-end', gap: spacing.xxs }}>
                <StatusDot tom={estado.tom} texto={estado.texto} />
                {latencyMs !== null ? (
                  <ThemedText variant="caption" tone="textSecondary" selectable>
                    {latencyMs} ms
                  </ThemedText>
                ) : null}
              </View>
            </No>
          );
        })}
      </ListSection>

      <ListSection
        titulo="Conceitos de Sistemas Distribuídos no Καιρός"
        rodape="Parâmetros do código (C.5 da especificação). Os números medidos ficam no estado das fontes e no registro."
      >
        {CONCEITOS_SD.map((k) => (
          <View key={k.id} accessible accessibilityLabel={`${k.titulo}. ${k.noKairos} Onde: ${k.onde}`}>
            <ListRow style={{ alignItems: 'flex-start' }}>
              <IconeEmBloco icone={k.icone} tom="neutro" />
              <View style={{ flex: 1, gap: spacing.xxs }}>
                <ThemedText variant="bodyStrong">{k.titulo}</ThemedText>
                <ThemedText variant="subhead" tone="textSecondary">
                  {k.noKairos}
                </ThemedText>
                <ThemedText variant="code" tone="tint" selectable>
                  {k.onde}
                </ThemedText>
              </View>
            </ListRow>
          </View>
        ))}
      </ListSection>

      <View style={{ gap: spacing.sm }}>
        <Botao
          titulo="Ver o registro de requisições"
          icone="relogio"
          variante="secundario"
          onPress={() => nav.empurrar('/registro-requisicoes')}
        />
        <Botao titulo="Estado das fontes" variante="texto" onPress={() => nav.empurrar('/provedores')} />
      </View>
    </StackScreen>
  );
}

function No({
  icone,
  titulo,
  texto,
  children,
}: {
  icone: IconName;
  titulo: string;
  texto: string;
  children: ReactNode;
}) {
  return (
    <ListRow>
      <IconeEmBloco icone={icone} tom="neutro" />
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <ThemedText variant="bodyStrong">{titulo}</ThemedText>
        <ThemedText variant="caption" tone="textSecondary">
          {texto}
        </ThemedText>
      </View>
      {children}
    </ListRow>
  );
}

/** Conector entre as camadas do diagrama (decorativo). */
function Seta() {
  const c = useColors();
  return (
    <View
      style={{ alignItems: 'center', marginVertical: -spacing.md }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Icon name="expandir" size={24} color={c.textSecondary} />
    </View>
  );
}
