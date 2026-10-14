// Novo trajeto. Salvar → volta à lista e confirma no snackbar com o atalho "Ver briefing".
import { router } from 'expo-router';

import { useSnackbar } from '@/components/snackbar';
import { StackScreen } from '@/components/stack-screen';
import { FORMULARIO_VAZIO } from '@/features/trajetos/trajeto-form-validation';
import { TrajetoForm } from '@/features/trajetos/trajeto-form';
import { useSalvarTrajeto } from '@/features/trajetos/use-trajetos';
import { mensagemDeErro } from '@/shared/api/errors';
import { feedbackTatil } from '@/shared/feedback-tatil';
import { ACOES, CONFIRMACOES } from '@/shared/textos';

export default function NovoTrajetoScreen() {
  const salvar = useSalvarTrajeto();
  const snackbar = useSnackbar();

  return (
    <StackScreen title="Novo trajeto">
      <TrajetoForm
        valoresIniciais={FORMULARIO_VAZIO}
        salvando={salvar.isPending}
        erroGeral={
          salvar.error
            ? `Não foi possível salvar: ${mensagemDeErro(salvar.error)} Seus dados continuam no formulário.`
            : null
        }
        onSalvar={(dados) =>
          salvar.mutate(
            { dados },
            {
              onSuccess: (salvo) => {
                feedbackTatil.sucesso();
                router.back();
                snackbar.mostrar({
                  mensagem: CONFIRMACOES.trajetoCriado(salvo.nome),
                  acao: {
                    rotulo: ACOES.verBriefing,
                    onPress: () =>
                      router.push({ pathname: '/trajetos/[id]/briefing', params: { id: salvo.id } }),
                  },
                });
              },
            }
          )
        }
      />
    </StackScreen>
  );
}
