// Conceitos de Sistemas Distribuídos aplicados no Καιρός (tela "Como o Καιρός funciona", item 9).
// Cada conceito tem o exemplo concreto e ONDE está no código. Os números são os parâmetros do
// código (C.5 da especificação), conferidos em 13/10/2026; ao mudar um parâmetro, atualize aqui junto.
// Os valores medidos (latência, sucesso) NÃO ficam aqui: a tela lê ao vivo do servidor e do registro.
import { CONTRACT_VERSION } from '@kairos/contracts';

import type { IconName } from '@/components/icon';

export type ConceitoSD = {
  id: string;
  titulo: string;
  icone: IconName;
  /** O que o Καιρός faz, em uma ou duas frases. */
  noKairos: string;
  /** Arquivo ou regra que implementa. */
  onde: string;
};

export const CONCEITOS_SD: readonly ConceitoSD[] = [
  {
    id: 'fan-out',
    titulo: 'Fan-out paralelo com prazo global',
    icone: 'alternativa',
    noKairos:
      'Um briefing consulta clima, ar, ônibus, trilhos e alagamento ao mesmo tempo (Promise.allSettled). Depois de 4 s, o servidor responde com o que tiver: uma fonte lenta não segura as outras.',
    onde: 'apps/api/src/modules/briefing/briefing.service.ts (PRAZO_BRIEFING_MS)',
  },
  {
    id: 'timeout',
    titulo: 'Tempo limite por fonte',
    icone: 'relogio',
    noKairos: 'Cada fonte tem 3 s para responder. Ao estourar, a dimensão vira "indisponível", com o motivo, e o veredito segue com as demais.',
    onde: 'apps/api/src/infrastructure/http-client.ts e timeoutMs de cada adaptador',
  },
  {
    id: 'breaker',
    titulo: 'Circuit breaker',
    icone: 'bloqueio',
    noKairos:
      'Após 3 falhas seguidas de uma fonte, o circuito abre por 60 s: o servidor para de insistir, responde na hora com o último dado guardado (se houver) e depois testa uma única chamada (meio-aberto).',
    onde: 'apps/api/src/infrastructure/circuit-breaker.ts',
  },
  {
    id: 'cache',
    titulo: 'Cache com validade por fonte',
    icone: 'desatualizado',
    noKairos:
      'Cada fonte tem a sua validade: ônibus 30 s, Metrô 5 min, clima 15 min, ar 60 min, alagamento 24 h. Dentro dela o dado é atual. Até 3 vezes a validade, sai como "desatualizado". Depois disso, "indisponível". A confiança do veredito cai junto.',
    onde: 'apps/api/src/infrastructure/provider-runner.ts (classifyAge) · B.8 da especificação',
  },
  {
    id: 'refresh-ahead',
    titulo: 'Renovação antecipada e aquecimento',
    icone: 'atualizar',
    noKairos:
      'Clima, ar, Metrô e alagamento são renovados em segundo plano ao chegar a 80 % da validade. O servidor também abre as conexões ao subir. Assim a pessoa quase sempre lê do cache atual, sem esperar a fonte.',
    onde: 'apps/api/src/infrastructure/refresh-ahead.ts e warm-up.ts',
  },
  {
    id: 'alternativa',
    titulo: 'Fonte alternativa',
    icone: 'metro',
    noKairos:
      'As linhas 4 e 5 aparecem na ARTESP e também na página Direto do Metrô. Se a ARTESP não responder, a situação delas vem da página do Metrô.',
    onde: 'apps/api/src/modules/briefing/briefing.service.ts (trilhos)',
  },
  {
    id: 'limites',
    titulo: 'Limites de taxa',
    icone: 'janela',
    noKairos:
      'ARTESP: até 10 consultas por hora, abaixo do teto de 12. OSRM e Nominatim: 1 por segundo, com folga de 1,1 s. Só o servidor consulta as fontes, então mil celulares não viram mil chamadas.',
    onde: 'apps/api/src/infrastructure/rate-limiter.ts (RATE_LIMITS)',
  },
  {
    id: 'contrato',
    titulo: 'Contrato compartilhado',
    icone: 'marcado',
    noKairos: `App e API validam as mensagens com os mesmos esquemas Zod (contrato ${CONTRACT_VERSION}). Uma resposta fora do formato vira erro de contrato, nunca um dado errado na tela.`,
    onde: 'packages/contracts · apps/mobile/src/shared/api/client.ts',
  },
  {
    id: 'offline',
    titulo: 'App offline-first',
    icone: 'offline',
    noKairos:
      'O último briefing de cada trajeto fica salvo no aparelho por até 7 dias. Sem rede, o app mostra o que tem com o aviso "Desatualizado" e refaz a consulta quando a conexão volta.',
    onde: 'apps/mobile/src/shared/api/persister.ts e network.ts',
  },
  {
    id: 'demo',
    titulo: 'Injeção de falhas (modo demonstração)',
    icone: 'demo',
    noKairos:
      'Cenários simulados derrubam ou atrasam fontes de propósito (SPTrans fora, clima lento, resposta inválida, dados obsoletos, tudo fora) para mostrar a degradação controlada.',
    onde: 'apps/api/src/modules/demo/cenarios.ts',
  },
  {
    id: 'idempotencia',
    titulo: 'Importação idempotente',
    icone: 'alagamento',
    noKairos:
      'A carga dos pontos de alagamento do GeoSampa calcula o SHA-256 do conteúdo. Se o mesmo arquivo já foi importado, nada muda, e rodar de novo é seguro.',
    onde: 'apps/api/database/scripts/import-geosampa.ts',
  },
];
