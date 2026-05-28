import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] }
  },
  build: {
    target: 'es2021',
    sourcemap: !!process.env.TAURI_DEBUG
  },
  esbuild: { target: 'es2021' },
  optimizeDeps: {
    include: ['xer-parser']
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.test.ts']
  }
});
