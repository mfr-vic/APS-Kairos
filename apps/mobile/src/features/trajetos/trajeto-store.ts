// RF04 / TC05: CRUD de trajetos salvos no aparelho.
// Este módulo não importa nada do React Native: recebe o armazenamento por parâmetro,
// para poder ser testado em Node com um armazenamento em memória (veja storage.ts).
import { DateTimeSchema, TrajetoRequestSchema } from '@kairos/contracts';
import { z } from 'zod';

export const CHAVE_TRAJETOS = 'kairos:trajetos:v1';

/** Trajeto salvo = nome + TrajetoRequest do contrato + id/datas. */
export const TrajetoSalvoSchema = z.object({
  id: z.string().min(1),
  nome: z.string().trim().min(1).max(60),
  trajeto: TrajetoRequestSchema,
  criadoEm: DateTimeSchema,
  atualizadoEm: DateTimeSchema,
  /**
   * Principal FIXADO pela pessoa (herói da aba Trajetos). Sem nenhum fixado, o herói é o primeiro
   * da hierarquia (ordenar-trajetos.ts). Opcional: dados salvos antes do campo seguem válidos.
   */
  principal: z.boolean().optional(),
  /**
   * Favorito explícito (estrela). Vários por vez; ficam no topo da lista. Opcional só para ler
   * dados antigos: `migrarTrajeto` preenche na leitura e toda gravação já sai com o campo.
   */
  favorito: z.boolean().optional(),
});

export type TrajetoSalvo = z.infer<typeof TrajetoSalvoSchema>;

/**
 * Migração de `kairos:trajetos:v1` sem trocar a chave: antes de 14/10 a estrela do cartão
 * marcava o PRINCIPAL. Quem tinha estrela continua com estrela (vira favorito) e continua
 * principal; os demais viram `favorito: false`. Idempotente: com o campo presente, nada muda.
 */
export function migrarTrajeto(t: TrajetoSalvo): TrajetoSalvo {
  if (t.favorito !== undefined) return t;
  return { ...t, favorito: t.principal === true };
}

/** O fixado como principal; sem fixado, o primeiro da lista (já ordenada pela hierarquia). */
export function trajetoPrincipal(lista: readonly TrajetoSalvo[]): TrajetoSalvo | undefined {
  return lista.find((t) => t.principal) ?? lista[0];
}

/** Dados editáveis pelo usuário (o resto é gerado pelo armazenamento). */
export type DadosTrajeto = {
  nome: string;
  trajeto: z.input<typeof TrajetoRequestSchema>;
};

/** Subconjunto da API do AsyncStorage usado aqui. */
export type ArmazenamentoChaveValor = {
  getItem(chave: string): Promise<string | null>;
  setItem(chave: string, valor: string): Promise<void>;
};

export class TrajetoInvalidoError extends Error {
  readonly problemas: string[];

  constructor(problemas: string[]) {
    super(`Trajeto inválido: ${problemas.join('; ')}`);
    this.problemas = problemas;
    this.name = 'TrajetoInvalidoError';
  }
}

function gerarId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function validar(item: unknown): TrajetoSalvo {
  const r = TrajetoSalvoSchema.safeParse(item);
  if (!r.success) {
    throw new TrajetoInvalidoError(
      r.error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`)
    );
  }
  return r.data;
}

export function criarTrajetoStore(
  armazenamento: ArmazenamentoChaveValor,
  agora: () => Date = () => new Date()
) {
  async function ler(): Promise<TrajetoSalvo[]> {
    const bruto = await armazenamento.getItem(CHAVE_TRAJETOS);
    if (!bruto) return [];
    let lista: unknown;
    try {
      lista = JSON.parse(bruto);
    } catch {
      console.warn('[trajetos] conteúdo salvo não é JSON; ignorando');
      return [];
    }
    if (!Array.isArray(lista)) return [];
    // Itens fora do schema (ex.: versão antiga) são descartados, sem derrubar a lista.
    const validos: TrajetoSalvo[] = [];
    for (const item of lista) {
      const r = TrajetoSalvoSchema.safeParse(item);
      if (r.success) validos.push(migrarTrajeto(r.data));
      else console.warn('[trajetos] item descartado por não seguir o schema', r.error.issues);
    }
    return validos;
  }

  async function gravar(lista: TrajetoSalvo[]): Promise<void> {
    await armazenamento.setItem(CHAVE_TRAJETOS, JSON.stringify(lista));
  }

  return {
    listar: ler,

    async obter(id: string): Promise<TrajetoSalvo | null> {
      return (await ler()).find((t) => t.id === id) ?? null;
    },

    async criar(dados: DadosTrajeto): Promise<TrajetoSalvo> {
      const ts = agora().toISOString();
      const novo = validar({ id: gerarId(), ...dados, criadoEm: ts, atualizadoEm: ts, favorito: false });
      await gravar([...(await ler()), novo]);
      return novo;
    },

    async atualizar(id: string, dados: DadosTrajeto): Promise<TrajetoSalvo> {
      const lista = await ler();
      const i = lista.findIndex((t) => t.id === id);
      if (i < 0) throw new Error(`Trajeto ${id} não encontrado`);
      const atualizado = validar({
        ...lista[i],
        ...dados,
        atualizadoEm: agora().toISOString(),
      });
      const nova = [...lista];
      nova[i] = atualizado;
      await gravar(nova);
      return atualizado;
    },

    /** Exclui e devolve o trajeto e a posição que ele ocupava (para o Desfazer), ou null. */
    async excluir(id: string): Promise<{ trajeto: TrajetoSalvo; indice: number } | null> {
      const lista = await ler();
      const indice = lista.findIndex((t) => t.id === id);
      if (indice < 0) return null;
      await gravar(lista.filter((t) => t.id !== id));
      return { trajeto: lista[indice], indice };
    },

    /**
     * Desfazer da exclusão: devolve o trajeto EXATAMENTE como era (mesmo id, datas e posição).
     * Se outro trajeto virou principal nesse meio-tempo, a escolha nova vence.
     */
    async restaurar(trajeto: TrajetoSalvo, indice: number): Promise<TrajetoSalvo> {
      const lista = (await ler()).filter((t) => t.id !== trajeto.id);
      const outroPrincipal = lista.some((t) => t.principal);
      const restaurado = validar(
        trajeto.principal && outroPrincipal ? { ...trajeto, principal: false } : trajeto
      );
      const nova = [...lista];
      nova.splice(Math.max(0, Math.min(indice, nova.length)), 0, restaurado);
      await gravar(nova);
      return restaurado;
    },

    /**
     * Marca um trajeto como principal (só um por vez); `null` desmarca todos (o principal volta a
     * ser o primeiro da lista). Devolve o id marcado antes, para o Desfazer. Não altera
     * `atualizadoEm`: o briefing em cache continua valendo.
     */
    async definirPrincipal(id: string | null): Promise<{ anterior: string | null }> {
      const lista = await ler();
      if (id !== null && !lista.some((t) => t.id === id)) {
        throw new Error(`Trajeto ${id} não encontrado`);
      }
      const anterior = lista.find((t) => t.principal)?.id ?? null;
      await gravar(lista.map((t) => ({ ...t, principal: t.id === id })));
      return { anterior };
    },

    /**
     * Favorita ou desfavorita (vários favoritos por vez). Devolve o valor anterior, para o
     * Desfazer. Como o principal, não altera `atualizadoEm` (o briefing em cache segue valendo).
     */
    async definirFavorito(id: string, favorito: boolean): Promise<{ anterior: boolean }> {
      const lista = await ler();
      const atual = lista.find((t) => t.id === id);
      if (!atual) throw new Error(`Trajeto ${id} não encontrado`);
      await gravar(lista.map((t) => (t.id === id ? { ...t, favorito } : t)));
      return { anterior: atual.favorito === true };
    },
  };
}

export type TrajetoStore = ReturnType<typeof criarTrajetoStore>;
