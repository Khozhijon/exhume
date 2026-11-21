import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // relative base: the built site works at any path (GitHub Pages project sites included)
  base: process.env.VITE_BASE ?? './',
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'fflate'],
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
