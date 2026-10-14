// Editar trajeto. Salvar → volta e confirma no snackbar. Excluir → sai da lista na hora,
// volta à tela inicial e oferece Desfazer por 5 s (sem diálogo: a ação é reversível).
import { router, useLocalSearchParams } from 'expo-router';

import { Botao } from '@/components/botao';
import { EstadoTela } from '@/components/estado-tela';
import { useSnackbar } from '@/components/snackbar';
import { StackScreen } from '@/components/stack-screen';
import { LembreteTrajeto } from '@/features/notificacoes/lembrete-trajeto';
import { valoresDeTrajeto } from '@/features/trajetos/trajeto-form-validation';
import { TrajetoForm } from '@/features/trajetos/trajeto-form';
import { useAcoesTrajeto } from '@/features/trajetos/use-acoes-trajeto';
import { useSalvarTrajeto, useTrajeto } from '@/features/trajetos/use-trajetos';
import { mensagemDeErro } from '@/shared/api/errors';
import { feedbackTatil } from '@/shared/feedback-tatil';
import { ACOES, CONFIRMACOES, ESTADOS } from '@/shared/textos';

export default function EditarTrajetoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: trajeto, isPending } = useTrajeto(id);
  const salvar = useSalvarTrajeto();
  const { excluirComDesfazer, excluindo } = useAcoesTrajeto();
  const snackbar = useSnackbar();

  if (isPending) {
    // Leitura local, rápida: só o cabeçalho, sem indicador piscando.
    return <StackScreen title="Editar trajeto" />;
  }
  if (!trajeto) {
    return (
      <StackScreen title="Editar trajeto">
        <EstadoTela
          tipo="vazio"
          titulo={ESTADOS.trajetoNaoEncontrado.titulo}
          texto={ESTADOS.trajetoNaoEncontrado.texto}
          acao={{ rotulo: ACOES.voltarAosTrajetos, onPress: () => router.back() }}
        />
      </StackScreen>
    );
  }

  return (
    <StackScreen title={`Editar: ${trajeto.nome}`}>
      <TrajetoForm
        // key: recria o formulário se o trajeto salvo mudar
        key={trajeto.atualizadoEm}
        valoresIniciais={valoresDeTrajeto(trajeto)}
        salvando={salvar.isPending}
        erroGeral={
          salvar.error
            ? `Não foi possível salvar: ${mensagemDeErro(salvar.error)} Seus dados continuam no formulário.`
            : null
        }
        onSalvar={(dados) =>
          salvar.mutate(
            { id: trajeto.id, dados },
            {
              onSuccess: (salvo) => {
                feedbackTatil.sucesso();
                router.back();
                snackbar.mostrar({ mensagem: CONFIRMACOES.trajetoAtualizado(salvo.nome) });
              },
            }
          )
        }
      />
      <LembreteTrajeto trajeto={trajeto} />
      <Botao
        titulo={excluindo ? 'Excluindo…' : ACOES.excluirTrajeto}
        variante="perigo"
        icone="excluir"
        desabilitado={excluindo}
        accessibilityHint="Exclui na hora; dá para desfazer por 5 segundos"
        onPress={() => excluirComDesfazer(trajeto, () => router.back())}
      />
    </StackScreen>
  );
}
