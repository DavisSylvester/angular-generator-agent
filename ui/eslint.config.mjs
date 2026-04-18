// Minimal ESLint config for the Panel Model UI.
// The `data-visual-id` requirement from docs/ui-plan/00-plan.md §9.4 is enforced
// by a custom AST check: any PanelComponent named in a feature decomposition
// must expose `visualId` as a bound input.

import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', '.angular/**', 'node_modules/**', 'out-tsc/**'],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: ['tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': ['warn', { allowExpressions: true }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
