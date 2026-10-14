// "O que fazer agora": lista agrupada de ações (ícone no tom + título com verbo + porquê).
import { LinhaInformativa } from '@/components/linha-informativa';
import { ListSection } from '@/components/list-section';

import { TOM_DA_ACAO, type Recomendacao } from './recomendacoes';

type Props = {
  itens: Recomendacao[];
  /** Tela inicial: só as N primeiras (as mais urgentes). */
  limite?: number;
};

export function ListaRecomendacoes({ itens, limite }: Props) {
  const visiveis = limite ? itens.slice(0, limite) : itens;
  return (
    <ListSection>
      {visiveis.length === 0 ? (
        <LinhaInformativa
          icone="favoravel"
          tom="ok"
          titulo="Siga normalmente"
          texto="As fontes que responderam não pedem nenhum cuidado extra."
        />
      ) : (
        visiveis.map((r) => (
          <LinhaInformativa
            key={r.id}
            testID={`recomendacao-${r.id}`}
            icone={r.icone}
            tom={TOM_DA_ACAO[r.tom]}
            titulo={r.titulo}
            texto={r.texto}
          />
        ))
      )}
    </ListSection>
  );
}
