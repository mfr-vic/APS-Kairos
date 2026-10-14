import { View } from 'react-native';

import { Botao } from '@/components/botao';
import { ListRow } from '@/components/list-row';
import { ListSection } from '@/components/list-section';
import { StackScreen } from '@/components/stack-screen';
import { StatusDot } from '@/components/status-dot';
import { ThemedText } from '@/components/themed-text';
import { useApiUrl } from '@/config/api';
import { nomeDaFonte } from '@/features/briefing/explicar-fonte';
import { dataHoraSP } from '@/features/briefing/format';
import { ServidorApiSecao } from '@/features/provedores/servidor-api-secao';
import { resumoContadores, TOLERANCIA_FALHAS } from '@/features/provedores/tolerancia-falhas';
import { useSaudeDoSistema } from '@/features/provedores/use-saude-do-sistema';
import { TEXTO_ESTADO as ESTADO_PROVEDOR } from '@/features/sobre/nos-do-sistema';
import { mensagemDeErro } from '@/shared/api/errors';
import { spacing } from '@/theme';
import { useNavegacao } from '@/shared/navegacao/use-navegacao';

// RF18 / F5. O tempo de resposta é medido no app (ida e volta até a API).
export default function ProvedoresScreen() {
  const nav = useNavegacao();
  const { health, providers, atualizando, atualizar } = useSaudeDoSistema();
  const apiUrl = useApiUrl();

  return (
    <StackScreen title="Estado das fontes" onRefresh={atualizar}>
      <ListSection titulo="API" rodape={`${apiUrl}/v1/health`}>
        <ListRow>
          <ThemedText variant="bodyStrong" style={{ flex: 1 }}>
            {health.error ? 'Servidor do Καιρός inacessível' : health.data ? 'Servidor do Καιρός' : 'Consultando o servidor…'}
          </ThemedText>
          {health.error ? (
            <StatusDot tom="erro" texto="sem resposta" />
          ) : health.data ? (
            <StatusDot tom="ok" texto="respondendo" />
          ) : (
            <StatusDot tom="neutro" texto="consultando" />
          )}
        </ListRow>
        {health.data && !health.error ? (
          <ListRow>
            <ThemedText variant="subhead" tone="textSecondary" style={{ flex: 1 }}>
              Tempo de resposta
            </ThemedText>
            <ThemedText variant="subheadStrong" selectable>
              {health.data.latencyMs} ms
            </ThemedText>
          </ListRow>
        ) : null}
        {health.data && !health.error ? (
          <ListRow>
            <ThemedText variant="subhead" tone="textSecondary" style={{ flex: 1 }}>
              Horário do servidor
            </ThemedText>
            <ThemedText variant="subheadStrong" selectable>
              {dataHoraSP(health.data.timestamp)}
            </ThemedText>
          </ListRow>
        ) : null}
        {health.error ? (
          <ListRow>
            <View style={{ flex: 1, gap: spacing.xxs }}>
              <ThemedText variant="subhead" selectable>
                {mensagemDeErro(health.error)}
              </ThemedText>
              <ThemedText variant="caption" tone="textSecondary">
                Confira se o celular está na mesma rede Wi-Fi do servidor e se a porta 3000 está liberada no firewall. Se o servidor mudou de endereço, ajuste em Servidor da API, logo abaixo.
              </ThemedText>
            </View>
          </ListRow>
        ) : null}
      </ListSection>

      <ServidorApiSecao />

      {providers.error && !health.error ? (
        <ThemedText variant="subhead" tone="danger" selectable>
          {mensagemDeErro(providers.error)}
        </ThemedText>
      ) : null}
      {providers.data && providers.data.providers.length > 0 ? (
        <ListSection titulo="Fontes de dados (medido pelo servidor)">
          {providers.data.providers.map((p) => (
            <ListRow key={p.name}>
              <View style={{ flex: 1, gap: spacing.xxs }}>
                <ThemedText variant="bodyStrong">{nomeDaFonte(p.name)}</ThemedText>
                <ThemedText variant="caption" tone="textSecondary" selectable>
                  Última resposta: {p.latencyMs === null ? 'sem medição' : `${p.latencyMs} ms`} · média:{' '}
                  {p.avgLatencyMs === null ? 'sem medição' : `${p.avgLatencyMs} ms`}
                </ThemedText>
                <ThemedText variant="caption" tone="textSecondary" selectable>
                  {resumoContadores(p.requestCount, p.successCount)} · Último sucesso:{' '}
                  {p.lastSuccessAt ? dataHoraSP(p.lastSuccessAt) : 'nenhum desde que o servidor subiu'}
                </ThemedText>
              </View>
              <StatusDot
                tom={ESTADO_PROVEDOR[p.status].tom}
                texto={ESTADO_PROVEDOR[p.status].texto}
              />
            </ListRow>
          ))}
        </ListSection>
      ) : null}

      <ListSection
        titulo="Tolerância a falhas"
        rodape="Parâmetros do servidor (C.5 da especificação). Contadores desde que a API subiu."
      >
        {TOLERANCIA_FALHAS.map((p) => (
          <ListRow key={p.rotulo}>
            <ThemedText variant="subhead" tone="textSecondary" style={{ flex: 1 }}>
              {p.rotulo}
            </ThemedText>
            <ThemedText variant="subheadStrong" style={{ flexShrink: 1, textAlign: 'right' }}>
              {p.valor}
            </ThemedText>
          </ListRow>
        ))}
      </ListSection>

      <ListSection>
        <ListRow chevron onPress={() => nav.empurrar('/registro-requisicoes')}>
          <ThemedText variant="body" style={{ flex: 1 }}>
            Registro de requisições deste aparelho
          </ThemedText>
        </ListRow>
      </ListSection>

      <Botao
        titulo={atualizando ? 'Consultando…' : 'Consultar de novo'}
        icone="atualizar"
        carregando={atualizando}
        onPress={atualizar}
      />
    </StackScreen>
  );
}
