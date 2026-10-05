import js from '@eslint/js';
import angular from 'angular-eslint';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const TS_FILES = ['apps/*/src/**/*.ts', 'packages/*/src/**/*.ts', 'e2e/**/*.ts'];
const LOGGER_FILES = [
  'packages/electron-core/src/logger.ts',
  'tooling/**/*.mjs',
  'apps/setup/src/renderer/**/*.js',
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/out-tsc/**',
      '**/.angular/**',
      'apps/renderer/public/**',
      'apps/desktop/build/**',
      'release/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  {
    files: TS_FILES,
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true, ignoreIIFE: true }],
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports', disallowTypeAnnotations: false },
      ],
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-console': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-control-regex': 'off',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
  {
    files: ['**/*.spec.ts', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
    },
  },
  {
    files: ['apps/renderer/src/**/*.ts', 'packages/ui/src/**/*.ts'],
    extends: [...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/prefer-standalone': 'error',
      '@angular-eslint/no-output-native': 'off',
      '@angular-eslint/no-output-on-prefix': 'off',
      '@angular-eslint/directive-selector': 'off',
      '@angular-eslint/component-selector': 'off',
    },
  },
  {
    files: ['apps/renderer/src/**/*.html', 'packages/ui/src/**/*.html'],
    extends: [...angular.configs.templateRecommended],
    rules: {
      '@angular-eslint/template/no-negated-async': 'error',
      '@angular-eslint/template/eqeqeq': ['error', { allowNullOrUndefined: true }],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Element[name=/^(?!iframe$)[a-z0-9]+$/] > TextAttribute[name="title"]',
          message: 'Use tx-hint from @testrix/ui instead of native title tooltips.',
        },
        {
          selector: 'Element[name=/^[a-z0-9]+$/] > BoundAttribute[name="title"]',
          message: 'Use tx-hint from @testrix/ui instead of native title tooltips.',
        },
        {
          selector: 'Element[name="kbd"]',
          message: 'Use <tx-hint variant="inline" keys="..."> for keyboard shortcuts.',
        },
      ],
    },
  },
  {
    files: LOGGER_FILES,
    rules: { 'no-console': 'off' },
  },
);
