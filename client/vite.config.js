import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Podczas developmentu Vite proxuje /api na backend (domyślnie port 4000),
 * dzięki czemu klient i serwer widzą się pod tym samym originem — tak jak na
 * produkcji za nginx-em. Efekt uboczny: nie trzeba ustawiać VITE_API_URL ani
 * konfigurować CORS-u tylko na potrzeby pracy lokalnej.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_TARGET || 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Osobny bundle dla bibliotek — po wdrożeniu poprawki w kodzie aplikacji
    // przeglądarka dociąga tylko mały plik, a React zostaje w cache.
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },
});
