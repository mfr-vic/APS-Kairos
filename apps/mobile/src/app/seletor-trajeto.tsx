// Folha "Trajeto em destaque" (ver app/_layout.tsx): formSheet no iOS; no Android, tela modal
// com cabeçalho nativo (a formSheet do Android congelava o app — shared/navegacao/apresentacao.ts).
// Arrastar para baixo (iOS) ou "voltar" fecha sem mudar nada. Navegação via useNavegacao:
// toques repetidos não desempilham nem empilham duas vezes.
import { Platform, ScrollView } from 'react-native';

import { trajetoPrincipal } from '@/features/trajetos/storage';
import { SeletorTrajeto } from '@/features/trajetos/seletor-trajeto';
import { useAcoesTrajeto } from '@/features/trajetos/use-acoes-trajeto';
import { useTrajetos } from '@/features/trajetos/use-trajetos';
import { folhaTemTituloProprio } from '@/shared/navegacao/apresentacao';
import { useNavegacao } from '@/shared/navegacao/use-navegacao';
import { spacing, useColors } from '@/theme';

export default function SeletorTrajetoScreen() {
  const c = useColors();
  const nav = useNavegacao();
  const { data: trajetos = [] } = useTrajetos();
  const { tornarPrincipal } = useAcoesTrajeto();
  const principal = trajetoPrincipal(trajetos);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
    >
      <SeletorTrajeto
        trajetos={trajetos}
        principalId={principal?.id}
        comTitulo={folhaTemTituloProprio(Platform.OS)}
        onEscolher={(t) => {
          if (!nav.voltar()) return;
          if (t.id !== principal?.id) tornarPrincipal(t);
        }}
        onNovo={() => nav.trocarPor('/trajetos/novo')}
      />
    </ScrollView>
  );
}
