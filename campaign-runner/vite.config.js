import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
