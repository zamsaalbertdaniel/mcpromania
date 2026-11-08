import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import importPlugin from 'eslint-plugin-import';
import prettier from 'eslint-plugin-prettier';

// no-eval, no-implied-eval, no-new-func and no-script-url ship with ESLint.
// eslint-plugin-security (detect-object-injection, non-literal-regexp, etc.)
// is not installed: it would be an extra dependency outside this task.

const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  {
    plugins: {
      prettier,
      import: importPlugin,
    },
    rules: {
      'prettier/prettier': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },
  {
    ignores: ['.next/**', 'node_modules/**', 'out/**', 'public/**'],
  },
];

export default eslintConfig;
