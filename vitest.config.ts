import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.prop.test.ts', 'mcp/**/*.test.mjs'],
    exclude: ['node_modules', 'dist'],
    environment: 'node',
  },
});
