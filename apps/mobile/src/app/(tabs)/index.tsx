// RF04 / RNF07: tela inicial. Responde, sem toque nenhum, se é hora de sair no trajeto
// principal, o que fazer, o tempo agora e nas próximas horas, e o estado de cada trajeto.
// Cabeçalho com contexto: aba · trajeto em destaque (troca na folha) · origem → destino ·
// atualizado às HH:MM · chip de saúde dos dados.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { EstadoTela } from '@/components/estado-tela';
import { ListSection } from '@/components/list-section';
import { Secao } from '@/components/secao';
import { Screen } from '@/components/screen';
import { atualizadoAs, useAgora } from '@/features/briefing/format';
import { HeroiEsqueleto } from '@/features/briefing/heroi-veredito';
import { ListaRecomendacoes } from '@/features/briefing/lista-recomendacoes';
import { mostraMelhorHorario } from '@/features/briefing/melhor-horario';
import { observacao } from '@/features/briefing/observacao';
import { recomendacoes } from '@/features/briefing/recomendacoes';
import { useBriefing } from '@/features/briefing/use-briefing';
import { ProximasHoras } from '@/features/tempo/proximas-horas';
import { TempoAgora } from '@/features/tempo/tempo-agora';
import { useTempoAgora } from '@/features/tempo/use-tempo-agora';
import { CartaoTrajeto } from '@/features/trajetos/cartao-trajeto';
import { motivoDestaque } from '@/features/trajetos/ordenar-trajetos';
import { PainelPrincipal } from '@/features/trajetos/painel-principal';
import { trajetoPrincipal } from '@/features/trajetos/storage';
import { useAcoesTrajeto } from '@/features/trajetos/use-acoes-trajeto';
import { CHAVE_USO_QUERY, useTrajetos, useUsoTrajetos } from '@/features/trajetos/use-trajetos';
import { mensagemDeErro } from '@/shared/api/errors';
import { CHAVE_BRIEFING } from '@/shared/api/query-keys';
import { useNavegacao } from '@/shared/navegacao/use-navegacao';
import { ACOES, ESTADOS } from '@/shared/textos';

const LIMITE_ACOES_INICIO = 3;
const RODAPE_ORDEM =
  'Ordem: favoritos primeiro; depois, os que você costuma abrir neste horário. Esse histórico fica só neste aparelho.';

export default function TrajetosScreen() {
  const trajetos = useTrajetos();
  const agora = useAgora();
  const qc = useQueryClient();
  // useNavegacao (item 8): toques repetidos abrem UMA tela.
  const nav = useNavegacao();
  const novoTrajeto = () => nav.empurrar('/trajetos/novo');
  const lista = trajetos.data ?? [];
  const principal = trajetoPrincipal(lista);
  const briefing = useBriefing(principal);
  const tempo = useTempoAgora();
  const uso = useUsoTrajetos();
  const { alternarFavorito, principalAutomatico } = useAcoesTrajeto();
  // Hierarquia: useTrajetos já devolve favoritos primeiro e, em cada grupo, o mais provável agora.
  const favoritos = lista.filter((t) => t.favorito);
  const outros = lista.filter((t) => !t.favorito);
  // Na 1ª pintura da lista os cartões não animam (a seção já entra); depois, quem muda de seção
  // ou é novo entra com fade.
  const [listaPintada, setListaPintada] = useState(false);
  const temLista = lista.length > 0;
  useEffect(() => {
    if (!temLista) return;
    const quadro = requestAnimationFrame(() => setListaPintada(true));
    return () => cancelAnimationFrame(quadro);
  }, [temLista]);

  const atualizar = () =>
    Promise.all([
      qc.refetchQueries({ queryKey: ['trajetos'] }),
      qc.refetchQueries({ queryKey: CHAVE_USO_QUERY }),
      qc.refetchQueries({ queryKey: ['tempo-agora'] }),
      principal ? qc.refetchQueries({ queryKey: [CHAVE_BRIEFING, principal.id] }) : null,
    ]);

  const b = briefing.data;
  const acoes = b ? recomendacoes(b, agora) : [];
  // Próximas horas: da origem do trajeto (mesma previsão que decidiu a janela); sem briefing, do widget.
  const climaBriefing = b ? observacao(b, 'weather')?.value : null;
  const horas = climaBriefing?.horas ?? tempo.data?.value?.horas ?? [];
  const localHoras = climaBriefing
    ? `Na origem de “${principal?.nome}” · Open-Meteo`
    : `${tempo.local.rotulo} · Open-Meteo`;

  const subtitulo = principal
    ? [
        `${principal.trajeto.origem.rotulo} → ${principal.trajeto.destino.rotulo}`,
        b ? atualizadoAs(b.geradoEm, agora) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'São Paulo · sair agora ou esperar?';

  return (
    <Screen
      rotulo="Trajetos"
      title={principal?.nome ?? 'Καιρός'}
      subtitulo={subtitulo}
      onPressTitulo={lista.length > 0 ? () => nav.empurrar('/seletor-trajeto') : undefined}
      rotuloSeletor={principal ? `Trajeto em destaque: ${principal.nome}. Toque para trocar` : undefined}
      onRefresh={atualizar}
    >
      {trajetos.isPending ? (
        <HeroiEsqueleto texto="Lendo os trajetos salvos neste aparelho…" />
      ) : trajetos.error ? (
        <EstadoTela
          tipo="erro"
          titulo={ESTADOS.erroLerTrajetos.titulo}
          texto={`${mensagemDeErro(trajetos.error)} ${ESTADOS.erroLerTrajetos.texto}`}
          acao={{ rotulo: ACOES.tentarDeNovo, onPress: () => trajetos.refetch(), icone: 'atualizar' }}
        />
      ) : !principal ? (
        <EstadoTela
          tipo="vazio"
          titulo={ESTADOS.semTrajetos.titulo}
          texto={ESTADOS.semTrajetos.texto}
          acao={{ rotulo: ACOES.cadastrarTrajeto, onPress: novoTrajeto, icone: 'mais' }}
        />
      ) : (
        <PainelPrincipal
          trajeto={principal}
          briefing={briefing}
          agora={agora}
          destaque={motivoDestaque(principal, uso.data ?? {}, agora)}
          onAutomatico={principalAutomatico}
        />
      )}

      {b && principal ? (
        <Secao
          titulo="O que fazer agora"
          acao={
            acoes.length > LIMITE_ACOES_INICIO
              ? {
                  rotulo: `Ver todas (${acoes.length})`,
                  accessibilityLabel: `Ver todas as ${acoes.length} ações no briefing`,
                  onPress: () =>
                    nav.empurrar({ pathname: '/trajetos/[id]/briefing', params: { id: principal.id } }),
                }
              : undefined
          }
        >
          <ListaRecomendacoes itens={acoes} limite={LIMITE_ACOES_INICIO} />
        </Secao>
      ) : null}

      <Secao titulo="Tempo agora" rodape={`${tempo.local.rotulo} · Open-Meteo`}>
        <TempoAgora agora={agora} />
      </Secao>

      {horas.length > 0 ? (
        <Secao titulo="Próximas horas" rodape={localHoras}>
          <ProximasHoras horas={horas} agora={agora} janela={b && mostraMelhorHorario(b) ? b.janelaMeteorologica : undefined} />
        </Secao>
      ) : null}

      {lista.length > 0 ? (
        <Secao
          titulo={`Seus trajetos (${lista.length})`}
          acao={{ rotulo: 'Novo', icone: 'mais', accessibilityLabel: ACOES.novoTrajeto, onPress: novoTrajeto }}
          rodape={
            favoritos.length === 0
              ? `Toque na estrela para pôr um trajeto em Favoritos. ${RODAPE_ORDEM}`
              : RODAPE_ORDEM
          }
        >
          {[
            { chave: 'favoritos', titulo: `Favoritos (${favoritos.length})`, itens: favoritos },
            {
              chave: 'outros',
              // Sem favoritos, a lista é uma só: "Outros" não faria sentido.
              titulo: favoritos.length ? `Outros trajetos (${outros.length})` : undefined,
              itens: outros,
            },
          ]
            .filter((s) => s.itens.length > 0)
            .map((s) => (
              <ListSection key={s.chave} titulo={s.titulo}>
                {s.itens.map((t) => (
                  <CartaoTrajeto
                    key={t.id}
                    trajeto={t}
                    agora={agora}
                    principal={t.id === principal?.id}
                    onAlternarFavorito={alternarFavorito}
                    animarEntrada={listaPintada}
                  />
                ))}
              </ListSection>
            ))}
        </Secao>
      ) : null}
    </Screen>
  );
}
