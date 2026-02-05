import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';
import path from 'path';
import { fileURLToPath } from 'url';
import tseslint from 'typescript-eslint';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

const compatConfig = compat.extends('airbnb', 'airbnb-typescript', 'prettier').map(config => {
  if (config.rules) {
    delete config.rules['@typescript-eslint/lines-between-class-members'];
    delete config.rules['@typescript-eslint/no-throw-literal'];
  }
  return config;
});

export default [
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', 'eslint.config.js', 'vite.config.ts', 'commitlint.config.js'],
  },
  js.configs.recommended,
  ...compatConfig,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.app.json',
      },
    },
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'react/react-in-jsx-scope': 'off',
      'import/prefer-default-export': 'off',
      'import/extensions': 'off',
      'react/function-component-definition': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      'react/require-default-props': 'off',
    },
  },
];
