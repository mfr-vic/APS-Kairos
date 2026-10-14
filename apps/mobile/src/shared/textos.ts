// Vocabulário recorrente do app (pt-BR), num lugar só, para as telas falarem a mesma língua:
// verbo + dado + horário; nada de "Erro", "Sem dados" ou "Carregando…" soltos.
// Textos específicos de uma tela ficam na própria feature; aqui só o que se repete.

/** Botões e links. Um termo por ação em todo o app. */
export const ACOES = {
  tentarDeNovo: 'Tentar de novo',
  atualizar: 'Atualizar',
  atualizarBriefing: 'Atualizar briefing',
  desfazer: 'Desfazer',
  novoTrajeto: 'Novo trajeto',
  cadastrarTrajeto: 'Cadastrar trajeto',
  verBriefing: 'Ver briefing',
  verBriefingCompleto: 'Ver briefing completo',
  compartilhar: 'Compartilhar briefing',
  voltarAosTrajetos: 'Voltar aos trajetos',
  salvarTrajeto: 'Salvar trajeto',
  excluirTrajeto: 'Excluir trajeto',
  editar: 'Editar',
  tornarPrincipal: 'Tornar principal',
  trocarTrajeto: 'Trocar trajeto',
  verDetalhes: 'Ver detalhes',
  ocultarDetalhes: 'Ocultar detalhes',
} as const;

/** Mensagens do snackbar (confirmação perceptível de cada ação). */
export const CONFIRMACOES = {
  trajetoCriado: (nome: string) => `“${nome}” salvo`,
  trajetoAtualizado: (nome: string) => `Alterações em “${nome}” salvas`,
  trajetoExcluido: (nome: string) => `“${nome}” excluído`,
  trajetoRestaurado: (nome: string) => `“${nome}” restaurado`,
  principalDefinido: (nome: string) => `“${nome}” agora é o principal`,
  principalRestaurado: (nome: string) => `“${nome}” voltou a ser o principal`,
  temaAplicado: (rotulo: string) => `Tema ${rotulo.toLowerCase()} aplicado`,
  briefingAtualizado: (hora: string) => `Briefing atualizado às ${hora}`,
  briefingCompartilhado: 'Briefing enviado',
  falhaAoCompartilhar: 'Este aparelho não abriu o compartilhamento. Tente de novo.',
  falhaAoDesfazer: 'Não foi possível desfazer. O trajeto continua como está.',
  falhaAoSalvarPrincipal: 'Não foi possível trocar o principal. Tente de novo.',
  falhaAoExcluir: 'Não foi possível excluir. O trajeto continua salvo.',
} as const;

/** Estados de tela (vazio, erro, offline, carregando). */
export const ESTADOS = {
  consultandoFontes: 'Consultando chuva, ar, ônibus, metrô, trem e alagamento do trajeto…',
  semTrajetos: {
    titulo: 'Cadastre seu primeiro trajeto',
    texto:
      'Informe origem, destino e as linhas que você usa. O Καιρός cruza chuva, ar, ônibus, metrô, trem e alagamentos e diz se é hora de sair.',
  },
  erroLerTrajetos: {
    titulo: 'Não foi possível ler seus trajetos',
    texto: 'Eles continuam guardados no aparelho. Tente ler de novo.',
  },
  trajetoNaoEncontrado: {
    titulo: 'Este trajeto não existe mais',
    texto: 'Ele foi excluído neste aparelho. Volte à lista e escolha outro.',
  },
  semConexaoSemBriefing: (nome: string) => ({
    titulo: 'Sem conexão e sem briefing salvo',
    texto: `O briefing de “${nome}” aparece assim que a internet voltar. Seus trajetos continuam salvos.`,
  }),
  erroBriefing: (nome: string, causa: string) => ({
    titulo: `Não foi possível consultar “${nome}”`,
    texto: `${causa} O trajeto continua salvo; tente de novo em instantes.`,
  }),
  desatualizado: (idade: string) => `Desatualizado · gerado ${idade}`,
  mostrandoSalvo: 'Mostrando o último briefing salvo.',
  semConexao: 'Sem conexão com a internet.',
} as const;

/** Chip de conexão no cabeçalho das abas. */
export const CONEXAO = {
  online: 'Online',
  atualizando: 'Atualizando',
  offline: 'Offline · salvos',
  semDados: 'Sem conexão',
  demo: 'Demonstração',
  semServidor: 'Servidor fora',
  parcial: 'Dados parciais',
} as const;
