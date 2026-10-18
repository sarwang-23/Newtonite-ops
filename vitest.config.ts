import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**', 'frontend/**'],
    testTimeout: 15000,
    hookTimeout: 15000,
    isolate: true,
  },
});
