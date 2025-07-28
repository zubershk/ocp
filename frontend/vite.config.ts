import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8090',
      '/admin/orders': 'http://localhost:8090',
      '/admin/health': 'http://localhost:8090',
      '/admin/menu': 'http://localhost:8090',
      '/admin/category': 'http://localhost:8090',
      '/admin/categories': 'http://localhost:8090',
      '/admin/upload': 'http://localhost:8090',
      '/admin/outlets': 'http://localhost:8090',
      '/admin/config': 'http://localhost:8090',
      '/admin/analytics': 'http://localhost:8090',
      '/admin/users': 'http://localhost:8090',
      '/admin/audit': 'http://localhost:8090',
      '/admin/me': 'http://localhost:8090',
      '/admin/conversations': 'http://localhost:8090',
      '/admin/debug': 'http://localhost:8090',
      '/uploads': 'http://localhost:8090',
      '/health': 'http://localhost:8090',
    },
  },
})
