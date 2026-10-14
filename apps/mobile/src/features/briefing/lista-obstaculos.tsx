// "Atrasos e obstáculos": o que atrapalha o trajeto agora e quais fontes falharam (com o motivo
// em linguagem humana). Vazia, diz o que foi verificado — não um "sem dados" genérico.
import type { BriefingResponse } from '@kairos/contracts';

import { LinhaInformativa } from '@/components/linha-informativa';
import { ListSection } from '@/components/list-section';

import { obstaculos, resumoSemObstaculos } from './obstaculos';

export function ListaObstaculos({ briefing, agora }: { briefing: BriefingResponse; agora: number }) {
  const itens = obstaculos(briefing, agora);
  return (
    <ListSection>
      {itens.length === 0 ? (
        <LinhaInformativa
          icone="favoravel"
          tom="ok"
          titulo="Nenhum atraso ou obstáculo"
          texto={resumoSemObstaculos(briefing)}
        />
      ) : (
        itens.map((o) => (
          <LinhaInformativa
            key={o.id}
            testID={`obstaculo-${o.id}`}
            icone={o.icone}
            tom={o.tom}
            titulo={o.titulo}
            texto={o.texto}
          />
        ))
      )}
    </ListSection>
  );
}
