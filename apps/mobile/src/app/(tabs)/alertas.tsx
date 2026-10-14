// Aba Alertas: resumo que conta alertas de risco E avisos informativos (nunca "tudo tranquilo"
// com um aviso logo abaixo), os alertas calculados ao vivo (último briefing + tempo agora) e o
// conteúdo orientativo "Saiba mais", com destaque no nível real de cada tema, e no fim os
// atalhos de emergência (Defesa Civil 199, Bombeiros 193) que abrem o discador.
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Cartao } from '@/components/cartao';
import { EstadoTela } from '@/components/estado-tela';
import { IconeEmBloco } from '@/components/icone-em-bloco';
import { Screen } from '@/components/screen';
import { Secao } from '@/components/secao';
import { ThemedText } from '@/components/themed-text';
import { AlertaCalculadoCard } from '@/features/alertas/alerta-calculado-card';
import { AlertaCard } from '@/features/alertas/alerta-card';
import { ContatosEmergencia } from '@/features/alertas/contatos-emergencia';
import { ALERTAS } from '@/features/alertas/alertas-conteudo';
import { nivelPorTema, resumoAlertas } from '@/features/alertas/avaliar-alertas';
import { useAlertas } from '@/features/alertas/use-alertas';
import { haQuantoTempo, horaSP, useAgora } from '@/features/briefing/format';
import { useBriefingMaisRecente } from '@/features/briefing/use-briefing';
import { CHAVE_BRIEFING } from '@/shared/api/query-keys';
import { spacing } from '@/theme';

export default function AlertasScreen() {
  const qc = useQueryClient();
  const agora = useAgora();
  const briefing = useBriefingMaisRecente();
  const { alertas, temDados } = useAlertas();
  const resumo = resumoAlertas(alertas);
  const niveis = nivelPorTema(alertas);
  // Temas com alerta ativo sobem; o resto mantém a ordem do conteúdo.
  const estaticos = [...ALERTAS].sort((a, b) => (niveis[b.id] ?? -1) - (niveis[a.id] ?? -1));

  const atualizar = () =>
    Promise.all([
      qc.refetchQueries({ queryKey: [CHAVE_BRIEFING] }),
      qc.refetchQueries({ queryKey: ['tempo-agora'] }),
    ]);

  return (
    <Screen
      title="Alertas"
      subtitulo={
        briefing
          ? `Do briefing das ${horaSP(briefing.geradoEm)} (${haQuantoTempo(briefing.geradoEm, agora)}) e do tempo agora`
          : 'Do tempo agora; abra um trajeto para incluir ônibus, metrô, trem e alagamento'
      }
      onRefresh={atualizar}
    >
      {!temDados ? (
        <EstadoTela
          tipo="vazio"
          icone="atencao"
          titulo="Nenhum dado para calcular alertas ainda"
          texto="Os alertas saem do briefing dos seus trajetos e do tempo agora. Abra um trajeto para consultá-lo."
          acao={{ rotulo: 'Ir para os trajetos', onPress: () => router.navigate('/') }}
        />
      ) : (
        <Cartao
          accessibilityLabel={`${resumo.titulo}. ${resumo.texto}`}
          style={{ flexDirection: 'row', alignItems: 'center' }}
        >
          <IconeEmBloco
            icone={resumo.tom === 'ok' ? 'favoravel' : resumo.tom === 'neutro' ? 'info' : 'atencao'}
            tom={resumo.tom}
            tamanho="lg"
          />
          <View style={{ flex: 1, gap: spacing.xxs }}>
            <ThemedText variant="headlineStrong">{resumo.titulo}</ThemedText>
            <ThemedText variant="subhead" tone="textSecondary">
              {resumo.texto}
            </ThemedText>
          </View>
        </Cartao>
      )}

      {alertas.length > 0 ? (
        <Secao titulo="Agora no seu trajeto">
          <View style={{ gap: spacing.md }}>
            {alertas.map((a) => (
              <AlertaCalculadoCard key={a.id} alerta={a} />
            ))}
          </View>
        </Secao>
      ) : null}

      <Secao titulo="Saiba mais" rodape="Conteúdo orientativo. Em emergência, use os atalhos abaixo.">
        <View style={{ gap: spacing.md }}>
          {estaticos.map((a) => (
            <AlertaCard key={a.id} alerta={a} nivel={niveis[a.id]} />
          ))}
        </View>
      </Secao>

      <Secao titulo="Emergência">
        <ContatosEmergencia />
      </Secao>
    </Screen>
  );
}
