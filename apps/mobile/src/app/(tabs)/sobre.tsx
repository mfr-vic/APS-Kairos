import Constants from 'expo-constants';
import { Image, Linking, Pressable, View } from 'react-native';

import { Botao } from '@/components/botao';
import { IconeEmBloco } from '@/components/icone-em-bloco';
import { LinhaInformativa } from '@/components/linha-informativa';
import { ListRow } from '@/components/list-row';
import { ListSection } from '@/components/list-section';
import { Screen } from '@/components/screen';
import { Secao } from '@/components/secao';
import { useSnackbar } from '@/components/snackbar';
import { ThemedText } from '@/components/themed-text';
import { ControleLembretes } from '@/features/notificacoes/controle-lembretes';
import { ATRIBUICOES } from '@/features/sobre/atribuicoes';
import { COMO_DECIDE } from '@/features/sobre/como-decide';
import { rotuloVersao } from '@/features/sobre/versao-do-app';
import { feedbackTatil } from '@/shared/feedback-tatil';
import { ACOES, CONFIRMACOES } from '@/shared/textos';
import { alvoMinimo, radius, spacing, useColors, useTemaPreferido, type TemaPreferido } from '@/theme';
import { useNavegacao } from '@/shared/navegacao/use-navegacao';

export default function SobreScreen() {
  const nav = useNavegacao();
  const versao = rotuloVersao(Constants.expoConfig?.version, Constants.executionEnvironment, __DEV__);
  return (
    <Screen rotulo="Sobre" title="Καιρός" subtitulo="Sair agora ou esperar? Para os seus trajetos em São Paulo">
      <ListSection>
        <ListRow>
          <Image
            source={require('@/assets/images/icon.png')}
            style={{ width: 48, height: 48, borderRadius: radius.md }}
            accessibilityIgnoresInvertColors
          />
          <View style={{ flex: 1, gap: spacing.xxs }}>
            <ThemedText variant="headlineStrong">Καιρός</ThemedText>
            <ThemedText variant="caption" tone="textSecondary" selectable>
              {versao}
            </ThemedText>
          </View>
        </ListRow>
        <ListRow>
          <ThemedText variant="subhead" tone="textSecondary" style={{ flex: 1 }}>
            Cruza chuva, qualidade do ar, ônibus, metrô, trem e pontos de alagamento do seu trajeto e diz se é
            hora de sair — com o porquê e a melhor janela nas próximas 6 h.
          </ThemedText>
        </ListRow>
        <ListRow
          chevron
          accessibilityLabel="Estado das fontes: resposta, latência e falhas de cada uma"
          onPress={() => nav.empurrar('/provedores')}
        >
          <ThemedText variant="body" style={{ flex: 1 }}>
            Estado das fontes
          </ThemedText>
        </ListRow>
        <ListRow
          chevron
          accessibilityLabel="Registro de requisições: as últimas chamadas do app ao servidor"
          onPress={() => nav.empurrar('/registro-requisicoes')}
        >
          <ThemedText variant="body" style={{ flex: 1 }}>
            Registro de requisições
          </ThemedText>
        </ListRow>
        <ListRow
          chevron
          accessibilityLabel="Relatório do sistema: briefings, vereditos por dia e disponibilidade das fontes"
          onPress={() => nav.empurrar('/relatorio')}
        >
          <ThemedText variant="body" style={{ flex: 1 }}>
            Relatório do sistema
          </ThemedText>
        </ListRow>
      </ListSection>

      <ControleLembretes />

      <BotaoComoFunciona />

      <Secao
        titulo="Como o Καιρός decide"
        rodape="A pior regra ativa define o veredito. Os alertas são orientativos e não substituem a Defesa Civil (199)."
      >
        <ListSection>
          {COMO_DECIDE.map((r) => (
            <LinhaInformativa key={r.id} icone={r.icone} tom={r.tom} titulo={r.titulo} texto={r.texto} />
          ))}
        </ListSection>
      </Secao>

      <Secao titulo="Tema">
        <ListSection>
          <ListRow>
            <SeletorTema />
          </ListRow>
        </ListSection>
      </Secao>

      <Secao
        titulo="Atribuições"
        rodape="A qualidade do ar exibida é estimativa de modelo (CAMS), não medição de estação nem o IQAr oficial da CETESB."
      >
        <ListSection>
          {ATRIBUICOES.map(({ texto, url }) => (
            <ListRow
              key={texto}
              chevron={!!url}
              accessibilityLabel={url ? `${texto}. Abrir os termos de uso` : undefined}
              onPress={url ? () => void Linking.openURL(url) : undefined}
            >
              <ThemedText variant="body" selectable={!url} style={{ flex: 1 }}>
                {texto}
              </ThemedText>
            </ListRow>
          ))}
        </ListSection>
      </Secao>

      {__DEV__ && (
        <Botao
          titulo="Exemplos de briefing (desenvolvimento)"
          variante="texto"
          onPress={() => nav.empurrar('/exemplos-briefing')}
        />
      )}
    </Screen>
  );
}

/**
 * Chamada realçada (item 7): superfície `decisaoSoft` — um tom acima das listas brancas, na cor de
 * decisão — levando à narrativa de Sistemas Distribuídos. Contraste AA conferido nos 2 temas.
 */
function BotaoComoFunciona() {
  const nav = useNavegacao();
  const c = useColors();
  return (
    <View
      testID="botao-como-funciona"
      style={{ backgroundColor: c.decisaoSoft, borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden' }}
    >
      <ListRow
        chevron
        tatil="toque"
        accessibilityLabel="Como o Καιρός funciona: o app, a API e as 7 fontes, ao vivo"
        onPress={() => nav.empurrar('/como-funciona')}
      >
        <IconeEmBloco icone="provedores" tom="ok" />
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <ThemedText variant="headlineStrong">Como o Καιρός funciona</ThemedText>
          <ThemedText variant="subhead" tone="textSecondary">
            Um app, uma API e 7 fontes: veja o sistema distribuído ao vivo.
          </ThemedText>
        </View>
      </ListRow>
    </View>
  );
}

const TEMAS: { valor: TemaPreferido; rotulo: string }[] = [
  { valor: 'claro', rotulo: 'Claro' },
  { valor: 'escuro', rotulo: 'Escuro' },
  { valor: 'sistema', rotulo: 'Do aparelho' },
];

/** Controle segmentado claro · escuro · do aparelho (persistido em kairos:tema:v1), com Desfazer. */
function SeletorTema() {
  const c = useColors();
  const { tema, definirTema } = useTemaPreferido();
  const snackbar = useSnackbar();

  function escolher(novo: TemaPreferido, rotulo: string) {
    if (novo === tema) return;
    const anterior = tema;
    feedbackTatil.selecao();
    definirTema(novo);
    snackbar.mostrar({
      mensagem: CONFIRMACOES.temaAplicado(rotulo),
      acao: { rotulo: ACOES.desfazer, onPress: () => definirTema(anterior) },
    });
  }

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Tema do aplicativo"
      style={{
        flex: 1,
        flexDirection: 'row',
        gap: spacing.xxs,
        backgroundColor: c.surfaceMuted,
        borderRadius: radius.md,
        borderCurve: 'continuous',
        padding: spacing.xxs,
      }}
    >
      {TEMAS.map(({ valor, rotulo }) => {
        const marcado = tema === valor;
        return (
          <Pressable
            key={valor}
            onPress={() => escolher(valor, rotulo === 'Do aparelho' ? 'do aparelho' : rotulo)}
            accessibilityRole="radio"
            accessibilityLabel={`Tema ${rotulo}`}
            accessibilityState={{ checked: marcado }}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: alvoMinimo - spacing.sm,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.sm,
              borderCurve: 'continuous',
              backgroundColor: marcado ? c.accent : pressed ? c.surfacePressed : 'transparent',
            })}
          >
            <ThemedText variant="subheadStrong" tone={marcado ? 'onAccent' : 'textSecondary'}>
              {rotulo}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}
