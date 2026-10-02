import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
          charts: ['recharts'],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: { '/api': 'http://localhost:4000' },
  },
});
