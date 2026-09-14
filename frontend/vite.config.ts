import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 5173,
    // strictPort: never drift to 5174 silently — the Control Panel,
    // shortcuts and health checks all assume :5173. Fail loudly instead.
    strictPort: true,
    hmr: {
      host: 'localhost',
      protocol: 'ws',
    },
    watch: {
      usePolling: true,
      interval: 1000,
    },
    proxy: {
      '/api': 'http://localhost:8090',
      '/admin': {
        target: 'http://localhost:8090',
        bypass(req) {
          if (req.headers['x-admin-key']) return null;
          return '/index.html';
        },
      },
      '/uploads': 'http://localhost:8090',
      '/health': 'http://localhost:8090',
    },
  },
})
