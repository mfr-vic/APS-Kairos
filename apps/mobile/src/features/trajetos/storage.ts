// RF04 / C.6: os trajetos ficam só no aparelho (AsyncStorage), nunca no servidor (RNF14).
// O histórico de uso (hierarquia da lista) também: ver uso-trajetos.ts.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { criarTrajetoStore } from './trajeto-store';
import { criarUsoStore } from './uso-trajetos';

export {
  CHAVE_TRAJETOS,
  migrarTrajeto,
  TrajetoInvalidoError,
  TrajetoSalvoSchema,
  trajetoPrincipal,
  type DadosTrajeto,
  type TrajetoSalvo,
} from './trajeto-store';
export { CHAVE_USO_TRAJETOS, type UsoTrajetos } from './uso-trajetos';

export const trajetoStore = criarTrajetoStore(AsyncStorage);
export const usoStore = criarUsoStore(AsyncStorage);
