import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Dedicated port: the main site owns :5173. Never drift — the panel
    // and shortcuts point at :5174 for the campaign UI.
    host: true,
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001',
    },
  },
  optimizeDeps: {
    exclude: ['react-router-dom', '@tanstack/react-query', 'lucide-react', 'gsap'],
  },
});
