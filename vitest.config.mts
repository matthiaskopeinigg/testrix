import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const resolveSrc = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@testrix/contracts': resolveSrc('./packages/contracts/src/index.ts'),
      '@testrix/ui': resolveSrc('./packages/ui/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/src/**/*.spec.ts', 'apps/*/src/**/*.spec.ts', 'tooling/**/*.spec.mjs'],
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      include: [
        'packages/contracts/src/**/*.ts',
        'packages/electron-core/src/**/*.ts',
        'packages/http-engine/src/**/*.ts',
        'apps/desktop/src/main/**/*.ts',
        'apps/renderer/src/app/**/*.ts',
      ],
      exclude: ['**/*.spec.ts', '**/*.test.ts', '**/index.ts'],
      reporter: ['text-summary', 'json-summary', 'html'],
      // Floors sit just under current coverage; raise them as tests land, never lower them.
      thresholds: {
        'packages/contracts/src/**': { lines: 68, functions: 72, branches: 52, statements: 67 },
        'packages/electron-core/src/**': { lines: 50, functions: 42, branches: 43, statements: 49 },
        'packages/http-engine/src/**': { lines: 25, functions: 30, branches: 22, statements: 25 },
        'apps/desktop/src/main/**': { lines: 13, functions: 15, branches: 9, statements: 13 },
        'apps/renderer/src/app/**': { lines: 12, functions: 10, branches: 12, statements: 12 },
      },
    },
  },
});
