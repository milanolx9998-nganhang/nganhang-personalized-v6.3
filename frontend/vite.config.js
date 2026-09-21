import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: process.env.API_TARGET || 'http://localhost:3003', changeOrigin: true },
      '/uploads': { target: process.env.API_TARGET || 'http://localhost:3003', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    manifest: true,
    emptyOutDir: true,
  },
});
