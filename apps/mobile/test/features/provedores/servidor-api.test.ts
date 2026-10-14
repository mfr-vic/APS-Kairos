// Servidor da API configurável no aparelho: normalização, persistência, restauração e limpeza do cache.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { API_URL_PADRAO, apiUrl, definirApiUrl } from '@/config/api';
import {
  CHAVE_SERVIDOR_API,
  carregarServidorApi,
  normalizarServidor,
  restaurarServidorPadrao,
  salvarServidorApi,
} from '@/features/provedores/servidor-api';
import { queryKeys } from '@/shared/api/query-keys';

import { novoQueryClient } from '../../support/render-com-query';

describe('normalizarServidor', () => {
  it.each([
    ['192.168.1.20:3000', 'http://192.168.1.20:3000'],
    ['192.168.1.20', 'http://192.168.1.20:3000'],
    ['  192.168.1.20:8080/  ', 'http://192.168.1.20:8080'],
    ['meu-pc.local', 'http://meu-pc.local:3000'],
    ['http://192.168.1.20:3000/', 'http://192.168.1.20:3000'],
    ['HTTP://Meu-PC.local', 'http://meu-pc.local'],
    ['https://api.exemplo.com.br/kairos/', 'https://api.exemplo.com.br/kairos'],
  ])('%s → %s', (entrada, esperado) => {
    expect(normalizarServidor(entrada)).toEqual({ ok: true, url: esperado });
  });

  it.each(['', '   ', 'ftp://192.168.1.20', '192.168.1.20:99999', '192.168.1.20:0', 'meu pc', 'http://', '192.168.1.20:abc', 'http://x.com?a=1'])(
    'rejeita %p com mensagem',
    (entrada) => {
      const n = normalizarServidor(entrada);
      expect(n.ok).toBe(false);
      if (!n.ok) expect(n.erro.length).toBeGreaterThan(10);
    }
  );
});

describe('persistência do servidor', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    definirApiUrl(null);
  });

  it('sem valor salvo vale o padrão do build', async () => {
    await carregarServidorApi();
    expect(apiUrl()).toBe(API_URL_PADRAO);
  });

  it('salvar persiste, carregar restaura e restaurar volta ao padrão', async () => {
    const qc = novoQueryClient();
    await salvarServidorApi('http://10.0.0.5:3000', qc);
    expect(apiUrl()).toBe('http://10.0.0.5:3000');
    expect(await AsyncStorage.getItem(CHAVE_SERVIDOR_API)).toBe('http://10.0.0.5:3000');

    definirApiUrl(null); // simula reabrir o app
    await carregarServidorApi();
    expect(apiUrl()).toBe('http://10.0.0.5:3000');

    await restaurarServidorPadrao(qc);
    expect(apiUrl()).toBe(API_URL_PADRAO);
    expect(await AsyncStorage.getItem(CHAVE_SERVIDOR_API)).toBeNull();
  });

  it('valor salvo inválido é ignorado', async () => {
    await AsyncStorage.setItem(CHAVE_SERVIDOR_API, 'ftp://lixo');
    await carregarServidorApi();
    expect(apiUrl()).toBe(API_URL_PADRAO);
  });

  it('trocar de servidor descarta dados da API e mantém os trajetos', async () => {
    const qc = novoQueryClient();
    qc.setQueryData(queryKeys.trajetos, [{ id: 't1' }]);
    qc.setQueryData(queryKeys.briefing('t1', 'x'), { veredito: 'FAVORAVEL' });
    qc.setQueryData(queryKeys.linhasTrilho, { linhas: [] });
    await salvarServidorApi('http://10.0.0.5:3000', qc);
    expect(qc.getQueryData(queryKeys.trajetos)).toEqual([{ id: 't1' }]);
    expect(qc.getQueryData(queryKeys.briefing('t1', 'x'))).toBeUndefined();
    expect(qc.getQueryData(queryKeys.linhasTrilho)).toBeUndefined();
  });
});
