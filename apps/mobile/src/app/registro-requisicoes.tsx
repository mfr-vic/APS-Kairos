// Registro de requisições (item 7, 13/10): as duas pontas do sistema distribuído lado a lado.
// Este aparelho = shared/api/registro.ts (ida e volta medida no app); servidor = contadores do
// ProviderRunner em /v1/health/providers (só chamadas reais às fontes, desde que a API subiu).
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { Botao } from '@/components/botao';
import { Icon } from '@/components/icon';
import { ListRow } from '@/components/list-row';
import { ListSection } from '@/components/list-section';
import { StackScreen } from '@/components/stack-screen';
import { useSnackbar } from '@/components/snackbar';
import { ThemedText } from '@/components/themed-text';
import { nomeDaFonte } from '@/features/briefing/explicar-fonte';
import { resumoContadores } from '@/features/provedores/tolerancia-falhas';
import { formatarEntrada, horaComSegundosSP } from '@/features/registro/formatar-entrada';
import { api } from '@/shared/api/client';
import { mensagemDeErro } from '@/shared/api/errors';
import { queryKeys } from '@/shared/api/query-keys';
import {
  CAPACIDADE_REGISTRO,
  limparRegistro,
  restaurarRegistro,
  resumirRegistro,
  useRegistro,
} from '@/shared/api/registro';
import { ACOES } from '@/shared/textos';
import { spacing, useColors } from '@/theme';

const PAGINA = 10;

export default function RegistroRequisicoesScreen() {
  const c = useColors();
  const snackbar = useSnackbar();
  const registro = useRegistro();
  const [visiveis, setVisiveis] = useState(PAGINA);
  const resumo = resumirRegistro(registro);
  const providers = useQuery({
    queryKey: queryKeys.providers,
    queryFn: ({ signal }) => api.providers(signal),
    staleTime: 0,
    retry: false,
  });

  function limpar() {
    const anteriores = limparRegistro();
    setVisiveis(PAGINA);
    snackbar.mostrar({
      mensagem: 'Registro limpo.',
      acao: { rotulo: ACOES.desfazer, onPress: () => restaurarRegistro(anteriores) },
    });
  }

  return (
    <StackScreen title="Registro de requisições" onRefresh={() => providers.refetch()}>
      <ListSection
        titulo="Este aparelho"
        rodape={`Últimas ${CAPACIDADE_REGISTRO} chamadas do app à API, só na memória (somem ao fechar o app). Endereços e coordenadas não são guardados.`}
      >
        <ListRow>
          <ThemedText variant="subhead" tone="textSecondary" style={{ flex: 1 }}>
            Taxa de sucesso
          </ThemedText>
          <ThemedText variant="subheadStrong" selectable>
            {resumo.taxaSucesso === null
              ? 'Sem requisições ainda'
              : `${resumo.sucesso}/${resumo.total} ok (${resumo.taxaSucesso}%)`}
          </ThemedText>
        </ListRow>
        {resumo.porRota.map((r) => (
          <ListRow key={r.rota}>
            <ThemedText variant="code" tone="textSecondary" style={{ flex: 1 }} selectable>
              {r.rota}
            </ThemedText>
            <ThemedText variant="subheadStrong" selectable>
              {r.total}× · média {r.latenciaMediaMs} ms
            </ThemedText>
          </ListRow>
        ))}
      </ListSection>

      <ListSection
        titulo="Servidor do Καιρός → fontes"
        rodape="Contadores do servidor desde que a API subiu: só chamadas reais às fontes (cache, circuit breaker e limite de taxa não contam)."
      >
        {providers.error ? (
          <ListRow>
            <ThemedText variant="subhead" tone="danger" style={{ flex: 1 }} selectable>
              {mensagemDeErro(providers.error)}
            </ThemedText>
          </ListRow>
        ) : !providers.data ? (
          <ListRow>
            <ThemedText variant="subhead" tone="textSecondary" style={{ flex: 1 }}>
              Consultando o servidor…
            </ThemedText>
          </ListRow>
        ) : (
          providers.data.providers.map((p) => (
            <ListRow key={p.name}>
              <ThemedText variant="body" style={{ flex: 1 }}>
                {nomeDaFonte(p.name)}
              </ThemedText>
              <View style={{ alignItems: 'flex-end', gap: spacing.xxs }}>
                <ThemedText variant="subheadStrong" selectable>
                  {resumoContadores(p.requestCount, p.successCount)}
                </ThemedText>
                <ThemedText variant="caption" tone="textSecondary" selectable>
                  média {p.avgLatencyMs === null ? 'sem medição' : `${p.avgLatencyMs} ms`}
                </ThemedText>
              </View>
            </ListRow>
          ))
        )}
      </ListSection>

      <ListSection
        titulo="Últimas requisições"
        acessorio={
          registro.length > 0 ? (
            <Botao titulo="Limpar" variante="texto" tamanho="sm" icone="excluir" onPress={limpar} />
          ) : null
        }
      >
        {registro.length === 0 ? (
          <ListRow>
            <ThemedText variant="subhead" tone="textSecondary" style={{ flex: 1 }}>
              Nenhuma requisição desde que o app abriu. Abra um briefing ou o estado das fontes.
            </ThemedText>
          </ListRow>
        ) : (
          registro.slice(0, visiveis).map((e) => {
            const { titulo, detalhe } = formatarEntrada(e);
            const ok = e.erro === null;
            return (
              <View
                key={e.id}
                accessible
                accessibilityLabel={`${ok ? 'Sucesso' : 'Falha'}. ${horaComSegundosSP(e.em)}. ${titulo}. ${detalhe}`}
              >
                <ListRow style={{ alignItems: 'flex-start' }}>
                  <Icon
                    name={ok ? 'favoravel' : 'atencao'}
                    size={20}
                    color={ok ? c.fgOk : c.fgErro}
                  />
                  <ThemedText variant="code" tone="textSecondary">
                    {horaComSegundosSP(e.em)}
                  </ThemedText>
                  <View style={{ flex: 1, gap: spacing.xxs }}>
                    <ThemedText variant="subheadStrong">{titulo}</ThemedText>
                    <ThemedText variant="caption" tone="textSecondary">
                      {detalhe}
                    </ThemedText>
                  </View>
                </ListRow>
              </View>
            );
          })
        )}
      </ListSection>
      {registro.length > visiveis ? (
        <Botao
          titulo="Mostrar mais"
          variante="texto"
          onPress={() => setVisiveis((v) => v + PAGINA)}
        />
      ) : null}
    </StackScreen>
  );
}
