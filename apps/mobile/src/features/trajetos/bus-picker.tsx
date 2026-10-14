// RF02 / TC03: buscar linha ("875A") → escolher sentido → escolher parada → até 3 linhas no MESMO ponto.
// Os limites são os do contrato (TrajetoRequestSchema): o picker só impede o que o schema recusaria.
import type { BusLine, BusLinesResponse } from '@kairos/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { Botao } from '@/components/botao';
import { LineBadge } from '@/components/line-badge';
import { ListRow } from '@/components/list-row';
import { ListSection } from '@/components/list-section';
import { ThemedText } from '@/components/themed-text';
import { api } from '@/shared/api/client';
import { mensagemDeErro } from '@/shared/api/errors';
import { queryKeys } from '@/shared/api/query-keys';
import { spacing } from '@/theme';

import { Campo, Erro } from './campo';

export const MAX_LINHAS_ONIBUS = 3;
const SEM_REDE =
  'Sem conexão: a busca de ônibus precisa de rede. Tente de novo quando a conexão voltar.';

type LinhaEncontrada = BusLinesResponse['linhas'][number];

type Props = {
  selecionadas: BusLine[];
  onChange: (linhas: BusLine[]) => void;
};

/** Olho Vivo: sentido 1 = terminal principal → secundário; 2 = o inverso. */
export function descreverSentido(l: LinhaEncontrada): string {
  return l.sentido === 1
    ? `${l.terminalPrincipal} → ${l.terminalSecundario}`
    : `${l.terminalSecundario} → ${l.terminalPrincipal}`;
}

export function BusPicker({ selecionadas, onChange }: Props) {
  const [termo, setTermo] = useState('');
  const [consulta, setConsulta] = useState('');
  const [linha, setLinha] = useState<LinhaEncontrada | null>(null);

  const pontoFixo = selecionadas[0]?.codigoParada;
  const cheio = selecionadas.length >= MAX_LINHAS_ONIBUS;

  const linhas = useQuery({
    queryKey: queryKeys.linhasOnibus(consulta),
    queryFn: ({ signal }) => api.linhasOnibus(consulta, signal),
    enabled: consulta.length > 0 && !linha,
    staleTime: Infinity,
  });
  const paradas = useQuery({
    queryKey: queryKeys.paradasOnibus(linha?.codigoLinha ?? 0),
    queryFn: ({ signal }) => api.paradasOnibus(linha!.codigoLinha, signal),
    enabled: !!linha,
    staleTime: Infinity,
  });

  function buscar() {
    setLinha(null);
    setConsulta(termo.trim());
  }

  function adicionar(codigoParada: number) {
    if (!linha) return;
    onChange([
      ...selecionadas,
      { codigoLinha: linha.codigoLinha, letreiro: linha.letreiro, codigoParada },
    ]);
    setLinha(null);
    setConsulta('');
    setTermo('');
  }

  function remover(codigoLinha: number) {
    onChange(selecionadas.filter((l) => l.codigoLinha !== codigoLinha));
  }

  return (
    <View style={{ gap: spacing.md }}>
      {selecionadas.length > 0 ? (
        <ListSection>
          {selecionadas.map((l) => (
            <ListRow key={l.codigoLinha}>
              <LineBadge tipo="onibus" letreiro={l.letreiro} />
              <ThemedText variant="subhead" tone="textSecondary" style={{ flex: 1 }}>
                ponto {l.codigoParada}
              </ThemedText>
              <Botao
                titulo="Remover"
                variante="texto"
                tamanho="sm"
                icone="remover"
                onPress={() => remover(l.codigoLinha)}
              />
            </ListRow>
          ))}
        </ListSection>
      ) : null}

      {cheio ? (
        <ThemedText variant="subhead" tone="textSecondary">
          Limite de {MAX_LINHAS_ONIBUS} linhas atingido.
        </ThemedText>
      ) : (
        <>
          {pontoFixo ? (
            <ThemedText variant="subhead" tone="textSecondary">
              As próximas linhas precisam passar no ponto {pontoFixo}.
            </ThemedText>
          ) : null}
          <Campo
            rotulo="Linha de ônibus"
            valor={termo}
            placeholder="Ex.: 875A"
            icone="onibus"
            onChange={setTermo}
            onSubmit={buscar}
          />
          <Botao
            titulo="Buscar linha"
            tamanho="sm"
            icone="busca"
            onPress={buscar}
            desabilitado={!termo.trim()}
            style={{ alignSelf: 'flex-start' }}
          />
        </>
      )}

      {!cheio && consulta && !linha ? (
        linhas.fetchStatus === 'paused' ? (
          <Erro texto={SEM_REDE} />
        ) : linhas.isPending ? (
          <ThemedText variant="subhead" tone="textSecondary">
            Buscando linhas…
          </ThemedText>
        ) : linhas.isError ? (
          <Erro texto={mensagemDeErro(linhas.error)} />
        ) : (
          <Opcoes
            vazio={`Nenhuma linha encontrada para “${consulta}”.`}
            itens={linhas.data.linhas
              .filter((l) => !selecionadas.some((s) => s.codigoLinha === l.codigoLinha))
              .map((l) => ({
                chave: l.codigoLinha,
                titulo: `${l.letreiro} · ${descreverSentido(l)}`,
                letreiro: l.letreiro,
                texto: descreverSentido(l),
                onPress: () => setLinha(l),
              }))}
          />
        )
      ) : null}

      {linha ? (
        <View style={{ gap: spacing.sm }}>
          <ThemedText variant="subheadStrong">
            {linha.letreiro} · {descreverSentido(linha)}: escolha o ponto
          </ThemedText>
          {paradas.fetchStatus === 'paused' ? (
            <Erro texto={SEM_REDE} />
          ) : paradas.isPending ? (
            <ThemedText variant="subhead" tone="textSecondary">
              Buscando pontos…
            </ThemedText>
          ) : paradas.isError ? (
            <Erro texto={mensagemDeErro(paradas.error)} />
          ) : (
            <Opcoes
              vazio={
                pontoFixo
                  ? `Esta linha não passa no ponto ${pontoFixo}. Escolha outra linha ou remova as atuais para trocar de ponto.`
                  : 'Nenhum ponto encontrado para esta linha.'
              }
              itens={paradas.data.paradas
                .filter((p) => !pontoFixo || p.codigoParada === pontoFixo)
                .map((p) => {
                  const titulo = `${p.nome}${p.endereco ? ` · ${p.endereco}` : ''} (${p.codigoParada})`;
                  return {
                    chave: p.codigoParada,
                    titulo,
                    texto: titulo,
                    onPress: () => adicionar(p.codigoParada),
                  };
                })}
            />
          )}
          <Botao titulo="Cancelar" variante="texto" tamanho="sm" onPress={() => setLinha(null)} />
        </View>
      ) : null}
    </View>
  );
}

type Opcao = {
  chave: number;
  /** Rótulo de acessibilidade (texto completo). */
  titulo: string;
  letreiro?: string;
  texto: string;
  onPress: () => void;
};

function Opcoes({ itens, vazio }: { itens: Opcao[]; vazio: string }) {
  if (itens.length === 0) return <ThemedText variant="subhead">{vazio}</ThemedText>;
  return (
    <ListSection>
      {itens.map((o) => (
        <ListRow key={o.chave} accessibilityLabel={o.titulo} onPress={o.onPress} chevron>
          {o.letreiro ? <LineBadge tipo="onibus" letreiro={o.letreiro} tamanho="sm" /> : null}
          <ThemedText variant="subhead" style={{ flex: 1 }}>
            {o.texto}
          </ThemedText>
        </ListRow>
      ))}
    </ListSection>
  );
}
