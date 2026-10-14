// RF25: controle "Lembrete de saída" de UM trajeto (tela Editar). Desligado por padrão; ligar pede
// a permissão nessa hora e propõe 10 min antes do horário habitual; o horário se ajusta em passos
// de 1 h e 5 min (o React Native não tem seletor de hora sem biblioteca nova).
import { useState } from 'react';
import { Switch, View } from 'react-native';

import { Botao } from '@/components/botao';
import { ListRow } from '@/components/list-row';
import { ListSection } from '@/components/list-section';
import { Secao } from '@/components/secao';
import { ThemedText } from '@/components/themed-text';
import type { TrajetoSalvo } from '@/features/trajetos/storage';
import { spacing } from '@/theme';

import { suportaLembretes } from './agendar-lembretes';
import { ANTECEDENCIA_MIN, formatarHorario, JANELA_DIAS, MIN_USOS, somarMinutos } from './horario-habitual';
import type { Lembrete } from './lembretes-store';
import { TEXTOS_LEMBRETE, useAcoesLembrete, useLembretes } from './use-lembretes';

export function descreverLembrete(l: Lembrete): string {
  const hora = formatarHorario(l);
  return l.origem === 'habitual' && l.habitual
    ? `Dias úteis às ${hora}, ${ANTECEDENCIA_MIN} min antes do seu horário habitual (${formatarHorario(l.habitual)}).`
    : `Dias úteis às ${hora} (horário escolhido por você).`;
}

const PASSOS = [
  { delta: -60, titulo: '−1 h', rotulo: 'Uma hora mais cedo' },
  { delta: 60, titulo: '+1 h', rotulo: 'Uma hora mais tarde' },
  { delta: -5, titulo: '−5 min', rotulo: 'Cinco minutos mais cedo' },
  { delta: 5, titulo: '+5 min', rotulo: 'Cinco minutos mais tarde' },
];

export function LembreteTrajeto({ trajeto: t }: { trajeto: TrajetoSalvo }) {
  const { data } = useLembretes();
  const acoes = useAcoesLembrete();
  const [ocupado, setOcupado] = useState(false);
  if (!suportaLembretes || !data) return null;
  const l = data.porTrajeto[t.id];

  async function alternar(ligar: boolean) {
    setOcupado(true);
    try {
      await (ligar ? acoes.ligar(t) : acoes.desligar(t.id));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Secao
      titulo={TEXTOS_LEMBRETE.titulo}
      rodape="Fica só neste aparelho; nada vai ao servidor. Tocar no aviso abre o briefing deste trajeto. O Android pode atrasar o aviso em alguns minutos."
    >
      <ListSection>
        <ListRow>
          <View style={{ flex: 1, gap: spacing.xxs }}>
            <ThemedText variant="body">Avisar nos dias úteis</ThemedText>
            <ThemedText variant="caption" tone="textSecondary">
              {l ? descreverLembrete(l) : 'Desligado.'}
            </ThemedText>
          </View>
          <Switch
            value={!!l}
            disabled={ocupado}
            onValueChange={(v) => void alternar(v)}
            accessibilityLabel={TEXTOS_LEMBRETE.titulo}
            accessibilityHint={l ? undefined : 'Pede permissão para notificar'}
          />
        </ListRow>
        {l ? (
          <ListRow>
            <View style={{ flex: 1, gap: spacing.sm }}>
              <ThemedText variant="subheadStrong" accessibilityLiveRegion="polite">
                Horário do aviso: {formatarHorario(l)}
              </ThemedText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {PASSOS.map((p) => (
                  <Botao
                    key={p.titulo}
                    titulo={p.titulo}
                    tamanho="sm"
                    tatil="selecao"
                    accessibilityLabel={`${p.rotulo} (${p.titulo})`}
                    onPress={() => acoes.ajustar(t.id, somarMinutos(l, p.delta))}
                  />
                ))}
              </View>
            </View>
          </ListRow>
        ) : null}
        {l && !l.habitual ? (
          <ListRow>
            <ThemedText variant="caption" tone="textSecondary" style={{ flex: 1 }}>
              Ainda não dá para saber seu horário habitual: são precisas {MIN_USOS} aberturas do briefing em
              dias úteis, em horários próximos, nos últimos {JANELA_DIAS} dias. Ajuste o horário acima.
            </ThemedText>
          </ListRow>
        ) : null}
        {l?.habitual && l.origem === 'manual' ? (
          <ListRow chevron onPress={() => acoes.usarHabitual(t.id)}>
            <ThemedText variant="body" tone="tint" style={{ flex: 1 }}>
              Usar {ANTECEDENCIA_MIN} min antes do horário habitual ({formatarHorario(l.habitual)})
            </ThemedText>
          </ListRow>
        ) : null}
        {l && !data.ativo ? (
          <ListRow>
            <ThemedText variant="caption" tone="textSecondary" style={{ flex: 1 }}>
              Os lembretes estão desligados em Sobre: este não toca até você religá-los lá.
            </ThemedText>
          </ListRow>
        ) : null}
      </ListSection>
    </Secao>
  );
}
