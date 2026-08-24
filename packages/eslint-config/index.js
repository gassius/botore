/**
 * Shared flat ESLint configuration.
 *
 * Pure packages additionally enforce the boundary rules from AGENTS.md via
 * scripts/check-boundaries.mjs (import-graph based). Here we enforce language
 * quality rules that apply everywhere.
 */
import tseslint from 'typescript-eslint';

/** @param {string[]} extraIgnores */
export function makeConfig(extraIgnores = []) {
  return tseslint.config(
    {
      ignores: ['**/dist/**', '**/node_modules/**', '**/.next/**', '**/coverage/**', ...extraIgnores],
    },
    ...tseslint.configs.recommended,
    {
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        'no-console': 'off',
        eqeqeq: ['error', 'smart'],
        'prefer-const': 'error',
      },
    },
  );
}

export default makeConfig();
