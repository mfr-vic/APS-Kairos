// Conteúdo ORIENTATIVO ESTÁTICO da aba Alertas (pt-BR), com as referências públicas que o
// projeto já usa na B.8 da especificação. Números só os da B.8; o resto é qualitativo.
// `regras` liga cada cartão aos motivos do briefing (RN01–RN08) para destaque.

export type AlertaConteudo = {
  id: string;
  tema: string;
  titulo: string;
  /** Uma linha, sempre visível. */
  resumo: string;
  /** Parágrafos revelados ao tocar. */
  detalhes: string[];
  fonte: string;
  /** Regras do briefing que este cartão explica (RN01–RN08). */
  regras: string[];
};

export const ALERTAS: AlertaConteudo[] = [
  {
    id: 'chuva',
    tema: 'Chuva',
    titulo: 'Chuva moderada e forte',
    resumo: 'Acima de 7,6 mm/h é chuva forte: melhor aguardar.',
    detalhes: [
      'O briefing usa os limiares da AMS: chuva moderada acima de 2,5 mm/h (Atenção) e forte acima de 7,6 mm/h (Aguardar), olhando as próximas 2 horas.',
      'Em chuva forte, a Defesa Civil de SP orienta evitar deslocamentos, não se abrigar sob árvores ou estruturas metálicas e ficar longe de córregos.',
    ],
    fonte: 'American Meteorological Society (limiares da B.8) · Defesa Civil SP',
    regras: ['RN01', 'RN02'],
  },
  {
    id: 'alagamento',
    tema: 'Alagamento',
    titulo: 'Áreas alagadas',
    resumo: 'Nunca atravesse áreas alagadas, a pé ou de carro.',
    detalhes: [
      'O briefing avisa quando há ponto histórico de alagamento a até 300 m do trajeto com chuva acima de 2,5 mm/h prevista.',
      'A Defesa Civil de SP orienta: não atravesse ruas alagadas — a água esconde buracos e a correnteza derruba pessoas e arrasta carros. A água também pode estar contaminada.',
    ],
    fonte: 'GeoSampa (histórico) · Defesa Civil SP',
    regras: ['RN03', 'RN04'],
  },
  {
    id: 'ar',
    tema: 'Qualidade do ar',
    titulo: 'Ar ruim para respirar',
    resumo: 'MP2,5 médio acima de 50 µg/m³ em 24 h = faixa Ruim.',
    detalhes: [
      'O briefing marca Atenção quando a média de 24 h de MP2,5 passa de 50 µg/m³ — início da faixa N3 (Ruim) do IQAr atualizado do MMA, alinhada ao padrão PI-2 da Resolução CONAMA 506/2024. A diretriz da OMS para 24 h é bem mais baixa: 15 µg/m³.',
      'Com o ar ruim, reduza esforço físico prolongado ao ar livre, principalmente crianças, gestantes, idosos e quem tem doença respiratória ou cardíaca. O valor exibido é estimativa de modelo (CAMS), não medição de estação.',
    ],
    fonte: 'CONAMA 506/2024 · IQAr/MMA · OMS (diretriz 2021)',
    regras: ['RN05'],
  },
  {
    id: 'trilhos',
    tema: 'Metrô e trens',
    titulo: 'Linha alterada ou paralisada',
    resumo: 'Linha paralisada: confirme antes de sair de casa.',
    detalhes: [
      'O briefing marca Atenção quando uma linha vinculada opera com alteração e Aguardar quando está paralisada (ou encerrada), com o texto original da fonte e, quando a operadora explica, o trecho afetado e o motivo.',
      'Antes de sair, confirme a situação nos canais oficiais da operadora da linha — Metrô (1, 2, 3 e 15), ViaQuatro (4), ViaMobilidade (5, 8 e 9), Linha Uni (6) ou TIC Trens (7) — e considere um caminho alternativo do seu trajeto. As linhas 10 a 13 (CPTM) não têm fonte pública no Καιρός.',
    ],
    fonte: 'ARTESP, API Trilhos (linhas 4 a 9; CC BY-NC 4.0) · Direto do Metrô (linhas 1, 2, 3 e 15)',
    regras: ['RN06'],
  },
  {
    id: 'onibus',
    tema: 'Ônibus',
    titulo: 'Ônibus demorando ou sem previsão',
    resumo: 'Mais de 20 min (ou sem previsão) vira Atenção.',
    detalhes: [
      'O briefing marca Atenção quando uma linha vinculada está a mais de 20 min do ponto ou sem nenhuma previsão (sem veículo transmitindo).',
      'Sem previsão não significa sem ônibus: a linha pode estar sem GPS ativo. Vale conferir no ponto ou considerar outra linha cadastrada.',
    ],
    fonte: 'SPTrans Olho Vivo',
    regras: ['RN07'],
  },
  {
    id: 'avisos-inmet',
    tema: 'Avisos oficiais',
    titulo: 'Cores dos avisos do INMET',
    resumo: 'Amarelo: perigo potencial · Laranja: perigo · Vermelho: grande perigo.',
    detalhes: [
      'O INMET publica avisos meteorológicos por cor: amarelo (perigo potencial — fique atento), laranja (perigo — evite exposição ao risco) e vermelho (grande perigo — risco à vida; siga as orientações da Defesa Civil).',
      'Estes avisos não entram no briefing; acompanhe-os nos canais oficiais em dias de tempo severo.', // conferir com o grupo se os avisos entram numa fase futura
    ],
    fonte: 'INMET · Defesa Civil SP',
    regras: [],
  },
];
