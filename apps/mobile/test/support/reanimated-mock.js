// Mock da reanimated no Jest (o módulo nativo/worklets não existe no Node).
// O mock oficial não traz useReducedMotion; nos testes, movimento reduzido = false.
const mock = require('react-native-reanimated/mock');

module.exports = {
  ...mock,
  useReducedMotion: () => false,
};
