// RF25: interruptor geral "Lembretes de saída" (aba Sobre), com o estado da permissão do aparelho
// e quantos trajetos têm lembrete. Desligar cancela todos os agendamentos sem apagar os horários.
import { useState } from 'react';
import { Linking, Switch, View } from 'react-native';

import { ListRow } from '@/components/list-row';
import { ListSection } from '@/components/list-section';
import { Secao } from '@/components/secao';
import { ThemedText } from '@/components/themed-text';
import { spacing } from '@/theme';

import { suportaLembretes } from './agendar-lembretes';
import { TEXTOS_LEMBRETE, useAcoesLembrete, useLembretes, usePermissaoLembretes } from './use-lembretes';

export function ControleLembretes() {
  const { data } = useLembretes();
  const permissao = usePermissaoLembretes().data;
  const acoes = useAcoesLembrete();
  const [ocupado, setOcupado] = useState(false);
  if (!suportaLembretes || !data) return null;
  const n = Object.keys(data.porTrajeto).length;

  async function alternar(v: boolean) {
    setOcupado(true);
    try {
      await acoes.definirGeral(v);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Secao
      titulo={TEXTOS_LEMBRETE.geral}
      rodape="Avisos locais, agendados neste aparelho, na hora de sair de cada trajeto com lembrete (ligue em Editar trajeto)."
    >
      <ListSection>
        <ListRow>
          <View style={{ flex: 1, gap: spacing.xxs }}>
            <ThemedText variant="body">{TEXTOS_LEMBRETE.geral}</ThemedText>
            <ThemedText variant="caption" tone="textSecondary">
              {n === 0 ? 'Nenhum trajeto com lembrete' : n === 1 ? '1 trajeto com lembrete' : `${n} trajetos com lembrete`}
              {permissao ? ` · ${TEXTOS_LEMBRETE.permissao[permissao]}` : ''}
            </ThemedText>
          </View>
          <Switch
            value={data.ativo}
            disabled={ocupado}
            onValueChange={(v) => void alternar(v)}
            accessibilityLabel={TEXTOS_LEMBRETE.geral}
          />
        </ListRow>
        {permissao === 'negada' ? (
          <ListRow chevron onPress={() => void Linking.openSettings()}>
            <ThemedText variant="body" tone="tint" style={{ flex: 1 }}>
              {TEXTOS_LEMBRETE.abrirConfiguracoes} do aparelho
            </ThemedText>
          </ListRow>
        ) : null}
      </ListSection>
    </Secao>
  );
}
