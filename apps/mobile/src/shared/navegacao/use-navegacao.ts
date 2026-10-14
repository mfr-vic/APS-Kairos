// Navegar UMA vez (item 8 de 13/10/2026): tocar várias vezes num botão abria a mesma tela
// várias vezes e exigia vários "voltar". Duas camadas:
//  1. app/_layout.tsx marca toda rota empilhada como `dangerouslySingular` (a pilha nunca tem
//     duas instâncias da mesma rota com os mesmos parâmetros);
//  2. este hook trava a navegação durante a transição: repetir o MESMO destino é ignorado (e,
//     se insistir, avisa "Abrindo…"); outro destino logo em seguida também espera a transição.
// A trava é do módulo (não do componente): o 2º toque pode cair num componente que já está
// sendo desmontado, ou noutro botão da mesma tela. Telas de outras frentes que ainda chamam
// `router.push` direto ficam protegidas pela camada 1.
import { router, type Href } from 'expo-router';
import { useMemo } from 'react';

import { useSnackbar } from '@/components/snackbar';
import { motion } from '@/theme/motion';

/** Transição de tela (≈ 250 ms) + folga para o JS montar a nova tela num aparelho lento. */
export const JANELA_NAVEGACAO_MS = motion.slow * 3;

export const AVISO_ABRINDO = 'Abrindo… só um instante.';

type Trava = { chave: string; ate: number; avisou: boolean };
let trava: Trava | null = null;

/** Só para testes: zera a trava entre casos. */
export function liberarNavegacao() {
  trava = null;
}

/** Caminho resolvido do destino, com parâmetros, para comparar "é a mesma tela?". */
export function chaveDoHref(href: Href): string {
  if (typeof href === 'string') return href;
  const params = { ...((href.params ?? {}) as Record<string, unknown>) };
  let caminho = String(href.pathname).replace(/\[([^\]]+)\]/g, (_, nome: string) => {
    const v = params[nome];
    delete params[nome];
    return v == null ? `[${nome}]` : String(v);
  });
  const resto = Object.keys(params)
    .sort()
    .map((k) => `${k}=${String(params[k])}`)
    .join('&');
  if (resto) caminho += `?${resto}`;
  return caminho;
}

export type Reserva = 'ok' | 'repetida' | 'ocupada';

/**
 * Tenta reservar a navegação para `chave`. 'repetida' = mesmo destino ainda em transição;
 * 'ocupada' = outro destino em transição. Pura (recebe `agora`) para os testes.
 */
export function reservarNavegacao(chave: string, agora = Date.now()): Reserva {
  if (trava && agora < trava.ate) return trava.chave === chave ? 'repetida' : 'ocupada';
  trava = { chave, ate: agora + JANELA_NAVEGACAO_MS, avisou: false };
  return 'ok';
}

/** Aviso só uma vez por transição (3 toques não viram 3 anúncios no leitor de tela). */
function deveAvisar(): boolean {
  if (!trava || trava.avisou) return false;
  trava.avisou = true;
  return true;
}

export function useNavegacao() {
  const snackbar = useSnackbar();

  return useMemo(() => {
    const recusar = (r: Reserva) => {
      if (r === 'repetida' && deveAvisar()) {
        snackbar.mostrar({ tipo: 'info', mensagem: AVISO_ABRINDO, duracaoMs: 1500 });
      }
      return false;
    };

    return {
      /** Empilha `href` uma vez. Devolve false se o toque foi ignorado. */
      empurrar(href: Href): boolean {
        const r = reservarNavegacao(chaveDoHref(href));
        if (r !== 'ok') return recusar(r);
        router.push(href);
        return true;
      },
      /** Volta uma tela, uma vez (dois toques no "fechar" não desempilham duas telas). */
      voltar(): boolean {
        const r = reservarNavegacao('<voltar>');
        if (r !== 'ok') return recusar(r);
        if (router.canGoBack()) router.back();
        return true;
      },
      /**
       * Troca a tela atual (ex.: a folha) por `href` numa ÚNICA ação de navegação (`replace`),
       * em vez de `back()` + `push()` no mesmo instante, que desmonta uma tela enquanto outra entra.
       */
      trocarPor(href: Href): boolean {
        const r = reservarNavegacao(chaveDoHref(href));
        if (r !== 'ok') return recusar(r);
        router.replace(href);
        return true;
      },
    };
  }, [snackbar]);
}
