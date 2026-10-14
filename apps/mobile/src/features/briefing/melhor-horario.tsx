// "Melhor horário para sair": aparece quando o veredito não é Favorável. Horário grande
// (janela meteorológica do briefing) + quanto falta + o porquê em uma frase. Sem janela,
// diz por que não há (ar ruim suspende a janela; sem previsão; chuva em todas as horas).
import type { BriefingResponse } from '@kairos/contracts';
import { View } from 'react-native';

import { Cartao } from '@/components/cartao';
import { IconeEmBloco } from '@/components/icone-em-bloco';
import { ThemedText } from '@/components/themed-text';
import { spacing } from '@/theme';

import { decimal, horaSP } from './format';
import { CHUVA_MODERADA_MM, PM25_RUIM } from './limiares';
import { emMinutos } from './leituras';
import { observacao } from './observacao';

type Props = { briefing: BriefingResponse; agora: number };

/** Texto do horário e do porquê (função pura, testada à parte). */
export function textoMelhorHorario(
  b: BriefingResponse,
  agora: number
): { horario: string | null; quando: string | null; porque: string } {
  const j = b.janelaMeteorologica;
  if (j) {
    const ini = Date.parse(j.inicio);
    const fim = Date.parse(j.fim);
    const quando =
      agora >= fim
        ? 'Essa janela já passou: atualize o briefing.'
        : agora >= ini
          ? `Agora, até as ${horaSP(j.fim)}.`
          : `Começa ${emMinutos(Math.ceil((ini - agora) / 60_000))}.`;
    return {
      horario: `${horaSP(j.inicio)}–${horaSP(j.fim)}`,
      quando,
      porque: `Primeira hora sem chuva acima de ${decimal(CHUVA_MODERADA_MM)} mm/h nas próximas 6 h.`,
    };
  }
  const ar = observacao(b, 'air')?.value;
  if (ar?.pm25Media24h != null && ar.pm25Media24h > PM25_RUIM) {
    return {
      horario: null,
      quando: null,
      porque: `Com o ar na faixa Ruim (média de 24 h acima de ${PM25_RUIM} µg/m³), nenhuma hora das próximas 6 h é indicada.`,
    };
  }
  const clima = observacao(b, 'weather');
  if (!clima?.value) {
    return { horario: null, quando: null, porque: 'Sem previsão do tempo, não dá para indicar um horário.' };
  }
  return {
    horario: null,
    quando: null,
    porque: `Todas as próximas 6 h têm chuva acima de ${decimal(CHUVA_MODERADA_MM)} mm/h prevista.`,
  };
}

/**
 * A janela do briefing é meteorológica: só ajuda quando o veredito vem do tempo (chuva,
 * alagamento, ar). Visto em 13/10 (03:13, Metrô fechado): sugerir "04:00" por causa de chuva
 * enganaria quem espera o Metrô abrir. Indeterminado também mostra (diz por que não há janela).
 */
export function mostraMelhorHorario(b: BriefingResponse): boolean {
  if (b.veredito === 'FAVORAVEL') return false;
  if (b.veredito === 'INDETERMINADO') return true;
  return b.motivos.some(
    (m) => m.severidade !== 'INFORMATIVO' && (m.dimensao === 'weather' || m.dimensao === 'flood' || m.dimensao === 'air')
  );
}

export function MelhorHorario({ briefing, agora }: Props) {
  if (!mostraMelhorHorario(briefing)) return null;
  const { horario, quando, porque } = textoMelhorHorario(briefing, agora);
  return (
    <Cartao
      testID="melhor-horario"
      accessibilityLabel={
        horario
          ? `Melhor horário para sair: ${horario.replace('–', ' às ')}. ${quando} ${porque}`
          : `Sem horário indicado para sair nas próximas 6 horas. ${porque}`
      }
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}
    >
      <IconeEmBloco icone="relogio" tom={horario ? 'ok' : 'neutro'} tamanho="lg" />
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <ThemedText variant="overline" tone="textSecondary">
          Melhor horário para sair
        </ThemedText>
        {horario ? (
          <ThemedText variant="metricLg" tone="tint" numberOfLines={1} adjustsFontSizeToFit>
            {horario}
          </ThemedText>
        ) : (
          <ThemedText variant="headlineStrong">Nenhum nas próximas 6 h</ThemedText>
        )}
        {quando ? <ThemedText variant="bodyStrong">{quando}</ThemedText> : null}
        <ThemedText variant="subhead" tone="textSecondary">
          {porque}
        </ThemedText>
      </View>
    </Cartao>
  );
}
