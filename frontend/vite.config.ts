import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    watch: {
      usePolling: true,
      interval: 1000,
    },
    proxy: {
      '/api': 'http://localhost:8090',
      '/admin': 'http://localhost:8090',
      '/uploads': 'http://localhost:8090',
      '/health': 'http://localhost:8090',
    },
  },
})
