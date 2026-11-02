import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
      input: { newtab: 'newtab.html', background: 'src/background.ts' },
      output: { entryFileNames: 'assets/[name].js' },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
});
