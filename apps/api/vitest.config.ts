import { defineConfig } from 'vitest/config';

// Com a máquina carregada (Metro/Expo + Docker), o 1º buildApp de um arquivo passou de 5 s (10/10/2026).
export default defineConfig({
  test: {
    testTimeout: 20_000,
    // RNF12: ≥ 70 % de linhas em rules/ e providers/ (T30). `npm run test:coverage -w apps/api`.
    coverage: {
      provider: 'v8',
      include: ['src/modules/rules/**', 'src/providers/**'],
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
    },
  },
});
