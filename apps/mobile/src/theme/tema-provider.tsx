// Preferência de tema do app (claro · escuro · do dispositivo), persistida em
// `kairos:tema:v1`. `useEsquema` sobrepõe o useColorScheme do sistema em todo o app:
// `useColors` (colors.ts) lê daqui, então basta envolver a raiz com <TemaProvider>.
// Fora do provider (testes unitários), cai no esquema do sistema.
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const CHAVE_TEMA = 'kairos:tema:v1';

export type TemaPreferido = 'claro' | 'escuro' | 'sistema';

type ContextoTema = {
  tema: TemaPreferido;
  definirTema: (tema: TemaPreferido) => void;
};

const Contexto = createContext<ContextoTema | null>(null);

function validar(valor: string | null): TemaPreferido {
  return valor === 'claro' || valor === 'escuro' ? valor : 'sistema';
}

/** Na web, `?tema=claro|escuro` força o tema (capturas com Chrome headless). */
function temaDaUrl(): TemaPreferido | null {
  if (process.env.EXPO_OS !== 'web' || typeof location === 'undefined') return null;
  const t = new URLSearchParams(location.search).get('tema');
  return t === 'claro' || t === 'escuro' ? t : null;
}

export function TemaProvider({ children }: PropsWithChildren) {
  const [tema, setTema] = useState<TemaPreferido>(() => temaDaUrl() ?? 'sistema');

  useEffect(() => {
    if (temaDaUrl()) return; // a URL vence; não deixa o armazenamento sobrescrever
    let ativo = true;
    AsyncStorage.getItem(CHAVE_TEMA).then(
      (valor) => {
        if (ativo) setTema(validar(valor));
      },
      () => {} // leitura falhou: fica no padrão "sistema"
    );
    return () => {
      ativo = false;
    };
  }, []);

  const definirTema = useCallback((novo: TemaPreferido) => {
    setTema(novo);
    AsyncStorage.setItem(CHAVE_TEMA, novo).catch(() => {});
  }, []);

  const valor = useMemo(() => ({ tema, definirTema }), [tema, definirTema]);
  return <Contexto value={valor}>{children}</Contexto>;
}

/** Preferência atual + como mudá-la (controle na aba Sobre). */
export function useTemaPreferido(): ContextoTema {
  const ctx = use(Contexto);
  return ctx ?? { tema: 'sistema', definirTema: () => {} };
}

/** Esquema efetivo ('light' | 'dark'): preferência do app, ou o sistema em "sistema". */
export function useEsquema(): 'light' | 'dark' {
  const { tema } = useTemaPreferido();
  const sistema = useColorScheme() === 'dark' ? 'dark' : 'light';
  if (tema === 'claro') return 'light';
  if (tema === 'escuro') return 'dark';
  return sistema;
}
