import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relativa: funziona su GitHub Pages indipendentemente dal nome del repository
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
