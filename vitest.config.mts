import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const resolveSrc = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@testrix/contracts': resolveSrc('./packages/contracts/src/index.ts'),
      '@testrix/motion': resolveSrc('./packages/motion/src/index.ts'),
      '@testrix/ui': resolveSrc('./packages/ui/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/src/**/*.spec.ts', 'apps/*/src/**/*.spec.ts'],
    environment: 'node',
  },
});
