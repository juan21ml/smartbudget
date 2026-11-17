import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        // Separa las librerías del código de la app para que el navegador las guarde en caché.
        manualChunks: { react: ['react', 'react-dom', 'react-router-dom', 'axios'], charts: ['recharts'] },
      },
    },
  },
});
