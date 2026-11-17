import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Split large vendors into long-lived cacheable chunks so the app
        // shell isn't a single ~900KB download on every first visit.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('recharts') || id.includes('d3-')) return 'charts';
          if (id.includes('framer-motion') || id.includes('gsap')) return 'motion';
          if (id.includes('@radix-ui') || id.includes('radix-ui')) return 'radix';
          if (id.includes('react-router') || id.includes('@tanstack')) return 'router-query';
          if (id.includes('react')) return 'react-vendor';
        },
      },
    },
  },
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
      // BOT_PROXY_URL overrides the bot target when :8090 is squatted
      // (e.g. stale netsh portproxy rules); default preserves the
      // canonical layout. Example: BOT_PROXY_URL=http://localhost:8091 npm run dev
      '/api': process.env.BOT_PROXY_URL ?? 'http://localhost:8090',
      '/admin': {
        target: process.env.BOT_PROXY_URL ?? 'http://localhost:8090',
        bypass(req) {
          if (req.headers['x-admin-key']) return null;
          return '/index.html';
        },
      },
      '/uploads': process.env.BOT_PROXY_URL ?? 'http://localhost:8090',
      '/health': process.env.BOT_PROXY_URL ?? 'http://localhost:8090',
    },
  },
})
