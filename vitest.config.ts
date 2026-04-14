import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    alias: {
      obsidian: resolve(__dirname, 'src/__mocks__/obsidian.ts'),
    },
  },
  resolve: {
    alias: {
      obsidian: resolve(__dirname, 'src/__mocks__/obsidian.ts'),
    },
  },
});
