// RF01 / TC01 / TC02: origem e destino por busca de endereço (GET /v1/geocode) ou pelo GPS.
// A busca roda ao confirmar (botão ou "enter"), não a cada letra: a política do Nominatim
// proíbe autocomplete e o servidor enfileira as chamadas a 1 req/s (ADR-15).
import type { GeocodeResponse, LatLon } from '@kairos/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { Botao } from '@/components/botao';
import { Icon } from '@/components/icon';
import { ListRow } from '@/components/list-row';
import { ListSection } from '@/components/list-section';
import { ThemedText } from '@/components/themed-text';
import { api } from '@/shared/api/client';
import { mensagemDeErro } from '@/shared/api/errors';
import { queryKeys } from '@/shared/api/query-keys';
import { spacing, useColors } from '@/theme';

import { Campo, Erro } from './campo';
import { obterLocalizacao } from './obter-localizacao';

/** Mesmo mínimo do servidor (GeocodeQuerySchema). */
export const MIN_CARACTERES_ENDERECO = 3;

export type PontoEscolhido = LatLon & { rotulo: string };

type Props = {
  /** "da origem" / "do destino", para os rótulos de acessibilidade. */
  doPonto: string;
  comLocalizacao?: boolean;
  onEscolher: (ponto: PontoEscolhido) => void;
};

export function AddressSearch({ doPonto, comLocalizacao = false, onEscolher }: Props) {
  const [termo, setTermo] = useState('');
  const [consulta, setConsulta] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [localizando, setLocalizando] = useState(false);

  const busca = useQuery({
    queryKey: queryKeys.geocode(consulta),
    queryFn: ({ signal }) => api.geocode(consulta, signal),
    enabled: consulta.length > 0,
    staleTime: Infinity,
  });

  function buscar() {
    const q = termo.trim();
    if (q.length < MIN_CARACTERES_ENDERECO) {
      setAviso(`Digite pelo menos ${MIN_CARACTERES_ENDERECO} caracteres para buscar.`);
      return;
    }
    setAviso(null);
    setConsulta(q);
  }

  function escolher(ponto: PontoEscolhido) {
    setConsulta('');
    setAviso(`Escolhido: ${ponto.rotulo}`);
    onEscolher(ponto);
  }

  async function usarLocalizacao() {
    setLocalizando(true);
    const r = await obterLocalizacao();
    setLocalizando(false);
    if (r.ok) escolher({ ...r.ponto, rotulo: 'Minha localização' });
    else setAviso(r.mensagem);
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <Campo
        rotulo={`Buscar endereço ${doPonto}`}
        valor={termo}
        placeholder="Ex.: Av. Paulista, 1000"
        icone="busca"
        onChange={setTermo}
        onSubmit={buscar}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Botao titulo="Buscar endereço" tamanho="sm" icone="busca" onPress={buscar} />
        {comLocalizacao ? (
          <Botao
            titulo={localizando ? 'Obtendo localização…' : 'Usar minha localização'}
            tamanho="sm"
            icone="localizacao"
            carregando={localizando}
            onPress={usarLocalizacao}
          />
        ) : null}
      </View>
      {aviso ? (
        <ThemedText variant="subhead" tone="textSecondary">
          {aviso}
        </ThemedText>
      ) : null}
      {consulta ? <ResultadoBusca consulta={consulta} busca={busca} onEscolher={escolher} /> : null}
    </View>
  );
}

type ResultadoProps = {
  consulta: string;
  busca: UseQueryResult<GeocodeResponse>;
  onEscolher: (p: PontoEscolhido) => void;
};

function ResultadoBusca({ consulta, busca, onEscolher }: ResultadoProps) {
  const c = useColors();
  if (busca.fetchStatus === 'paused') {
    return (
      <Erro texto="Sem conexão: a busca de endereço precisa de rede. Use a localização do aparelho ou tente de novo." />
    );
  }
  if (busca.isPending)
    return (
      <ThemedText variant="subhead" tone="textSecondary">
        Buscando…
      </ThemedText>
    );
  if (busca.isError) return <Erro texto={mensagemDeErro(busca.error)} />;
  if (busca.data.resultados.length === 0) {
    return <ThemedText variant="subhead">Nenhum endereço encontrado para “{consulta}”.</ThemedText>;
  }
  return (
    <ListSection>
      {busca.data.resultados.map((r) => (
        <ListRow
          key={`${r.lat},${r.lon}`}
          accessibilityLabel={`Escolher ${r.rotulo}`}
          onPress={() => onEscolher({ lat: r.lat, lon: r.lon, rotulo: r.rotulo })}
        >
          <Icon name="destino" size={20} color={c.textSecondary} />
          <ThemedText variant="subhead" style={{ flex: 1 }}>
            {r.rotulo}
          </ThemedText>
        </ListRow>
      ))}
    </ListSection>
  );
}
