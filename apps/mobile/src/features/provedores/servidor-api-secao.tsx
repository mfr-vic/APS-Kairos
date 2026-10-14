// "Servidor da API" em Estado das fontes: troca o endereço da API sem novo build (qualquer rede local).
// Testar conexão consulta GET /v1/health no endereço digitado ANTES de salvar.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { Botao } from '@/components/botao';
import { ListRow } from '@/components/list-row';
import { ListSection } from '@/components/list-section';
import { StatusDot } from '@/components/status-dot';
import { ThemedText } from '@/components/themed-text';
import { API_URL_PADRAO, useApiUrl } from '@/config/api';
import { Campo } from '@/features/trajetos/campo';
import { api } from '@/shared/api/client';
import { mensagemDeErro } from '@/shared/api/errors';
import { spacing } from '@/theme';

import { normalizarServidor, restaurarServidorPadrao, salvarServidorApi } from './servidor-api';

type Resultado = { tom: 'ok' | 'erro'; texto: string; detalhe?: string };

export function ServidorApiSecao() {
  const qc = useQueryClient();
  const atual = useApiUrl();
  const personalizado = atual !== API_URL_PADRAO;
  const [texto, setTexto] = useState(personalizado ? atual : '');
  const [erroCampo, setErroCampo] = useState<string | undefined>();
  const [resultado, setResultado] = useState<Resultado | null>(null);

  function validar(): string | null {
    const n = normalizarServidor(texto);
    setErroCampo(n.ok ? undefined : n.erro);
    return n.ok ? n.url : null;
  }

  async function testar() {
    const url = validar();
    if (!url) return;
    setResultado(null);
    try {
      await api.healthEm(url);
      setResultado({ tom: 'ok', texto: 'API: up', detalhe: url });
    } catch (err) {
      setResultado({ tom: 'erro', texto: 'Sem resposta', detalhe: mensagemDeErro(err) });
    }
  }

  async function salvar() {
    const url = validar();
    if (!url) return;
    await salvarServidorApi(url, qc);
    setTexto(url === API_URL_PADRAO ? '' : url);
    setResultado({ tom: 'ok', texto: 'Salvo', detalhe: `O app agora usa ${url}.` });
  }

  async function restaurar() {
    await restaurarServidorPadrao(qc);
    setTexto('');
    setErroCampo(undefined);
    setResultado({ tom: 'ok', texto: 'Padrão restaurado', detalhe: `O app agora usa ${API_URL_PADRAO}.` });
  }

  return (
    <ListSection
      titulo="Servidor da API"
      rodape="Endereço do computador que roda a API na mesma rede Wi-Fi. Sem porta, vale a 3000. Ao salvar, os dados do servidor anterior são descartados; os trajetos continuam."
    >
      <ListRow accessibilityLabel={`Em uso: ${atual}, ${personalizado ? 'personalizado' : 'padrão'}`}>
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <ThemedText variant="subhead" tone="textSecondary">
            Em uso ({personalizado ? 'personalizado' : 'padrão'})
          </ThemedText>
          <ThemedText variant="subheadStrong" selectable>
            {atual}
          </ThemedText>
        </View>
      </ListRow>
      <ListRow>
        <View style={{ flex: 1, gap: spacing.sm }}>
          <Campo
            rotulo="Endereço do servidor"
            valor={texto}
            placeholder="192.168.1.20:3000"
            teclado="url"
            erro={erroCampo}
            onChange={(t) => {
              setTexto(t);
              setErroCampo(undefined);
              setResultado(null);
            }}
          />
          {resultado ? (
            <View style={{ gap: spacing.xxs }} accessibilityLiveRegion="polite">
              <StatusDot tom={resultado.tom} texto={resultado.texto} />
              {resultado.detalhe ? (
                <ThemedText variant="caption" tone="textSecondary" selectable>
                  {resultado.detalhe}
                </ThemedText>
              ) : null}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <Botao titulo="Testar conexão" tamanho="sm" onPress={testar} />
            <Botao titulo="Salvar" tamanho="sm" variante="primario" tatil="sucesso" onPress={salvar} />
            {personalizado ? (
              <Botao titulo="Restaurar padrão" tamanho="sm" variante="texto" onPress={restaurar} />
            ) : null}
          </View>
        </View>
      </ListRow>
    </ListSection>
  );
}
