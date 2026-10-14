// Servidor da API escolhido no aparelho: o .apk funciona em qualquer rede local sem novo build.
// Persistido em `kairos:servidor-api:v1`; sem valor salvo vale o EXPO_PUBLIC_API_URL do build.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient } from '@tanstack/react-query';

import { API_URL_PADRAO, definirApiUrl } from '@/config/api';
import { CHAVE_LEMBRETES_QUERY } from '@/features/notificacoes/use-lembretes';
import { CHAVE_USO_QUERY } from '@/features/trajetos/use-trajetos';
import { queryKeys } from '@/shared/api/query-keys';

export const CHAVE_SERVIDOR_API = 'kairos:servidor-api:v1';
export const PORTA_PADRAO = 3000;

export type Normalizado = { ok: true; url: string } | { ok: false; erro: string };

const FORMATO = /^(https?):\/\/([a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*)(:(\d{1,5}))?(\/[^\s?#]*)?$/i;

/**
 * Aceita `192.168.1.20:3000`, `192.168.1.20` (ganha :3000) ou `http://…` completo (porta como veio).
 * Sem barra no fim.
 */
export function normalizarServidor(entrada: string): Normalizado {
  const texto = entrada.trim().replace(/\/+$/, '');
  if (!texto) return { ok: false, erro: 'Digite o endereço do computador que roda a API (ex.: 192.168.1.20:3000).' };
  const temEsquema = /^[a-z][a-z0-9+.-]*:\/\//i.test(texto);
  if (temEsquema && !/^https?:\/\//i.test(texto)) {
    return { ok: false, erro: 'Use um endereço http:// ou https://.' };
  }
  const m = FORMATO.exec(temEsquema ? texto : `http://${texto}`);
  const porta = m?.[7];
  if (!m || (porta !== undefined && (Number(porta) < 1 || Number(porta) > 65535))) {
    return { ok: false, erro: 'Endereço inválido. Exemplo: 192.168.1.20:3000' };
  }
  const esquema = m[1].toLowerCase();
  const sufixoPorta = porta !== undefined ? `:${porta}` : temEsquema ? '' : `:${PORTA_PADRAO}`;
  return { ok: true, url: `${esquema}://${m[2].toLowerCase()}${sufixoPorta}${m[8] ?? ''}` };
}

/** Lê o endereço salvo antes da 1ª requisição (o layout raiz espera esta promessa). */
export async function carregarServidorApi(): Promise<void> {
  try {
    const salvo = await AsyncStorage.getItem(CHAVE_SERVIDOR_API);
    const n = salvo ? normalizarServidor(salvo) : null;
    definirApiUrl(n?.ok ? n.url : null);
  } catch {
    definirApiUrl(null); // sem armazenamento: vale o padrão
  }
}

/** Consultas que só leem o aparelho (trajetos, uso, lembretes): sobrevivem à troca de servidor. */
/** Descarta o que veio do servidor anterior (briefings, linhas, saúde…) e refaz as consultas ativas. */
function esquecerServidorAnterior(qc: QueryClient) {
  // Montado na hora (não no carregamento do módulo): o layout raiz importa este arquivo cedo.
  const LOCAIS = new Set<unknown>([queryKeys.trajetos[0], CHAVE_USO_QUERY[0], CHAVE_LEMBRETES_QUERY[0]]);
  // Sem await: o Salvar não espera o novo servidor responder a cada consulta.
  qc.resetQueries({ predicate: (q) => !LOCAIS.has(q.queryKey[0]) }).catch(() => {});
}

/** `url` já normalizada. Igual ao padrão do build = mesmo que restaurar. */
export async function salvarServidorApi(url: string, qc: QueryClient): Promise<void> {
  if (url === API_URL_PADRAO) return restaurarServidorPadrao(qc);
  await AsyncStorage.setItem(CHAVE_SERVIDOR_API, url);
  definirApiUrl(url);
  esquecerServidorAnterior(qc);
}

export async function restaurarServidorPadrao(qc: QueryClient): Promise<void> {
  await AsyncStorage.removeItem(CHAVE_SERVIDOR_API);
  definirApiUrl(null);
  esquecerServidorAnterior(qc);
}
