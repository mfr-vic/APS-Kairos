// RF01–RF03 / TC22: formulário de novo trajeto e de edição.
// Origem e destino no estilo app de rota: ponto (origem) e pino (destino) ligados por uma linha.
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { Botao } from '@/components/botao';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { radius, shadows, spacing, useColors } from '@/theme';

import { AddressSearch, type PontoEscolhido } from './address-search';
import { BusPicker } from './bus-picker';
import { Campo, Erro } from './campo';
import { RailPicker } from './rail-picker';
import type { DadosTrajeto } from './storage';
import {
  validarFormulario,
  type ErrosFormulario,
  type ValoresFormulario,
  type ValoresPonto,
} from './trajeto-form-validation';

type Props = {
  valoresIniciais: ValoresFormulario;
  salvando: boolean;
  erroGeral?: string | null;
  onSalvar: (dados: DadosTrajeto) => void;
};

// Pontos do exemplo oficial do contrato (packages/contracts/examples/briefing-request.json),
// para testar sem digitar coordenadas.
const EXEMPLO_ORIGEM: ValoresPonto = { rotulo: 'MASP', lat: '-23.5614961', lon: '-46.6559677' };
const EXEMPLO_DESTINO: ValoresPonto = {
  rotulo: 'Praça da Sé',
  lat: '-23.5503898',
  lon: '-46.633081',
};

export function TrajetoForm({ valoresIniciais, salvando, erroGeral, onSalvar }: Props) {
  const [valores, setValores] = useState(valoresIniciais);
  const [erros, setErros] = useState<ErrosFormulario>({});

  function salvar() {
    const r = validarFormulario(valores);
    if (!r.ok) {
      setErros(r.erros);
      return;
    }
    setErros({});
    onSalvar(r.dados);
  }

  function setPonto(qual: 'origem' | 'destino', campo: keyof ValoresPonto, texto: string) {
    setValores((v) => ({ ...v, [qual]: { ...v[qual], [campo]: texto } }));
  }

  // Mantém o rótulo que o usuário digitou; senão usa o do endereço (contrato: até 60 caracteres).
  function escolherPonto(qual: 'origem' | 'destino', p: PontoEscolhido) {
    setValores((v) => ({
      ...v,
      [qual]: {
        rotulo: v[qual].rotulo || p.rotulo.slice(0, 60).trim(),
        lat: String(p.lat),
        lon: String(p.lon),
      },
    }));
  }

  const temErros = Object.keys(erros).length > 0;

  return (
    <View style={{ gap: spacing.xl }}>
      <Campo
        rotulo="Nome do trajeto"
        valor={valores.nome}
        placeholder="Ex.: Casa → Faculdade"
        erro={erros.nome}
        onChange={(nome) => setValores((v) => ({ ...v, nome }))}
      />

      <View style={{ gap: spacing.sm }}>
        <TituloSecao>Rota</TituloSecao>
        <Superficie>
          {(['origem', 'destino'] as const).map((qual) => (
            <PontoRota key={qual} qual={qual}>
              <AddressSearch
                doPonto={qual === 'origem' ? 'da origem' : 'do destino'}
                comLocalizacao={qual === 'origem'}
                onEscolher={(p) => escolherPonto(qual, p)}
              />
              <Campo
                rotulo="Rótulo (opcional)"
                valor={valores[qual].rotulo}
                placeholder={qual === 'origem' ? 'Ex.: Casa' : 'Ex.: Faculdade'}
                erro={erros[`${qual}.rotulo`]}
                onChange={(t) => setPonto(qual, 'rotulo', t)}
              />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Campo
                    rotulo="Latitude"
                    valor={valores[qual].lat}
                    placeholder="-23.5505"
                    teclado="numbers-and-punctuation"
                    erro={erros[`${qual}.lat`]}
                    onChange={(t) => setPonto(qual, 'lat', t)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Campo
                    rotulo="Longitude"
                    valor={valores[qual].lon}
                    placeholder="-46.6333"
                    teclado="numbers-and-punctuation"
                    erro={erros[`${qual}.lon`]}
                    onChange={(t) => setPonto(qual, 'lon', t)}
                  />
                </View>
              </View>
            </PontoRota>
          ))}
        </Superficie>
        <Botao
          titulo="Preencher com o exemplo (MASP → Praça da Sé)"
          variante="texto"
          tamanho="sm"
          onPress={() =>
            setValores((v) => ({ ...v, origem: EXEMPLO_ORIGEM, destino: EXEMPLO_DESTINO }))
          }
        />
      </View>

      <View style={{ gap: spacing.sm }}>
        <TituloSecao>Metrô e trem (opcional)</TituloSecao>
        <RailPicker
          selecionadas={valores.trilhos}
          onChange={(trilhos) => setValores((v) => ({ ...v, trilhos }))}
        />
        {erros.trilhos ? <Erro texto={erros.trilhos} /> : null}
      </View>

      <View style={{ gap: spacing.sm }}>
        <TituloSecao>Ônibus (opcional)</TituloSecao>
        <BusPicker
          selecionadas={valores.onibus}
          onChange={(onibus) => setValores((v) => ({ ...v, onibus }))}
        />
        {erros.onibus ? <Erro texto={erros.onibus} /> : null}
      </View>

      <View style={{ gap: spacing.sm }}>
        {temErros ? <Erro texto="Corrija os campos destacados antes de salvar." /> : null}
        {erroGeral ? <Erro texto={erroGeral} /> : null}
        <Botao
          titulo={salvando ? 'Salvando…' : 'Salvar trajeto'}
          variante="primario"
          carregando={salvando}
          onPress={salvar}
        />
      </View>
    </View>
  );
}

function TituloSecao({ children }: { children: string }) {
  return (
    <ThemedText
      variant="overline"
      tone="textSecondary"
      accessibilityRole="header"
      style={{ paddingHorizontal: spacing.xs }}
    >
      {children}
    </ThemedText>
  );
}

function Superficie({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <View
      style={{
        backgroundColor: c.surface,
        borderRadius: radius.lg,
        borderCurve: 'continuous',
        boxShadow: shadows.card,
        padding: spacing.lg,
        gap: spacing.lg,
      }}
    >
      {children}
    </View>
  );
}

/** Coluna à esquerda com o marcador do ponto; a linha liga a origem ao destino. */
function PontoRota({ qual, children }: { qual: 'origem' | 'destino'; children: ReactNode }) {
  const c = useColors();
  const origem = qual === 'origem';
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md }}>
      <View style={{ alignItems: 'center', width: 24 }}>
        <Icon name={origem ? 'origem' : 'destino'} size={24} color={origem ? c.tint : c.danger} />
        {origem ? (
          <View
            style={{
              flex: 1,
              width: 2,
              marginTop: spacing.xs,
              marginBottom: -spacing.lg,
              backgroundColor: c.separator,
            }}
          />
        ) : null}
      </View>
      <View style={{ flex: 1, gap: spacing.md }}>
        <ThemedText variant="headline" accessibilityRole="header">
          {origem ? 'Origem' : 'Destino'}
        </ThemedText>
        {children}
      </View>
    </View>
  );
}
