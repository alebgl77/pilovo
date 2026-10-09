import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({
  plugins: [react()],
  build: { target: 'chrome120', sourcemap: false, rollupOptions: { input: { index: resolve(import.meta.dirname, 'index.html'), sidepanel: resolve(import.meta.dirname, 'sidepanel.html') } } },
});
