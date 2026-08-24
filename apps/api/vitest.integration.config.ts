import { defineConfig } from 'vitest/config';

/**
 * Integration tests run against the local Supabase Postgres and require a
 * reset database (pnpm db:reset). Skipped automatically when DATABASE_URL
 * is absent so plain `pnpm test` never fails without the stack.
 */
export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    environment: 'node',
    hookTimeout: 60_000,
    testTimeout: 30_000,
    maxConcurrency: 1,
  },
});
