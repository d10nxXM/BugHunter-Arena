import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';

// eslint-plugin-jsx-a11y is deferred: its peerDependencies (eslint ^3 - ^9) do not accept ESLint 10.

export default defineConfig([
  globalIgnores(['dist', 'public/pyodide']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    files: ['src/workers/**/*.js'],
    languageOptions: { globals: globals.worker },
  },
  {
    files: ['scripts/**/*.{js,mjs}', 'vite.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.test.{js,jsx}', 'src/test/**/*.{js,jsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  prettier,
]);
