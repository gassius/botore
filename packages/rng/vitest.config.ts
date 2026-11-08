import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // rng ships committed .js next to .ts; tests import the .js entrypoints.
      include: ['src/all.js', 'src/index.js', 'src/seed.js', 'src/sha256-counter.js'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
});
