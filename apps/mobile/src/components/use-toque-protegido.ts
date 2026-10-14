// Toque protegido (item 8 de 13/10/2026): tocar várias vezes no mesmo controle disparava a
// ação várias vezes (várias telas iguais empilhadas, vários "voltar"). Regras, para TODO
// Botao, ListRow e Cartao tocável:
//  - toques repetidos em até JANELA_TOQUE_MS são ignorados;
//  - se a ação devolve uma promessa, nada dispara de novo até ela terminar; o controle mostra
//    "processando" (spinner + accessibilityState.busy);
//  - se a promessa passa de AVISO_PROCESSANDO_MS, ou se a pessoa insiste enquanto ela roda,
//    aparece UM snackbar curto "Processando…" (anunciado pelo leitor de tela) e, na insistência,
//    uma háptica de aviso;
//  - a háptica do toque sai junto com a ação, uma por ação: se o próprio handler já vibrou
//    (ex.: sucesso ao salvar), o componente não vibra de novo.
// A trava de navegação (shared/navegacao/use-navegacao.ts) cobre o caso entre controles
// diferentes; esta cobre o mesmo controle, inclusive ações que não navegam.
import { useCallback, useEffect, useRef, useState } from 'react';

import { feedbackTatil, marcaTatil, vibrar, type TipoTatil } from '@/shared/feedback-tatil';

import { useSnackbar } from './snackbar';

/** Repetições dentro desta janela são o mesmo toque (duplo toque, dedo trêmulo). */
export const JANELA_TOQUE_MS = 500;
/** Ação que passa disto sem terminar ganha o aviso "Processando…". */
export const AVISO_PROCESSANDO_MS = 400;
export const AVISO_PROCESSANDO = 'Processando… só um instante.';

export type AcaoDeToque = () => unknown;

export type OpcoesToque = {
  /** Háptica do toque; false = nenhuma (o handler cuida). */
  tatil?: TipoTatil | false;
  /** Texto do aviso quando a ação demora (ex.: "Abrindo o briefing…"). */
  aviso?: string;
};

function ehPromessa(v: unknown): v is PromiseLike<unknown> {
  return typeof (v as PromiseLike<unknown> | null)?.then === 'function';
}

export function useToqueProtegido(acao: AcaoDeToque | undefined, opcoes: OpcoesToque = {}) {
  const { tatil = 'toque', aviso = AVISO_PROCESSANDO } = opcoes;
  const snackbar = useSnackbar();
  const [processando, setProcessando] = useState(false);
  const emCurso = useRef(false);
  const ultimo = useRef(Number.NEGATIVE_INFINITY);
  const avisou = useRef(false);
  const montado = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const aoTocar = useCallback(() => {
    if (!acao) return;
    const avisar = () => {
      if (avisou.current) return;
      avisou.current = true;
      snackbar.mostrar({ tipo: 'info', mensagem: aviso, duracaoMs: 1500 });
    };

    if (emCurso.current) {
      // Insistiu enquanto a ação anterior roda: diz que está processando (uma vez).
      if (!avisou.current) feedbackTatil.aviso();
      avisar();
      return;
    }
    const agora = Date.now();
    if (agora - ultimo.current < JANELA_TOQUE_MS) return;
    ultimo.current = agora;
    avisou.current = false;

    const antes = marcaTatil();
    const resultado = acao();
    if (tatil && marcaTatil() === antes) vibrar(tatil);

    if (!ehPromessa(resultado)) return;
    emCurso.current = true;
    setProcessando(true);
    timer.current = setTimeout(avisar, AVISO_PROCESSANDO_MS);
    const fim = () => {
      emCurso.current = false;
      ultimo.current = Date.now();
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (montado.current) setProcessando(false);
    };
    resultado.then(fim, fim);
  }, [acao, aviso, snackbar, tatil]);

  return { aoTocar, processando };
}
