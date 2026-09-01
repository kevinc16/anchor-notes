import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['lib/**/*.ts'],
      exclude: ['lib/types.ts'],
      reporter: [['text-summary', { file: 'coverage-summary.txt' }], 'html', 'json-summary', 'lcovonly'],
      reportOnFailure: true,
    },
  },
});
