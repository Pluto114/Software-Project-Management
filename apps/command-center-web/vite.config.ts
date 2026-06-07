import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  base: '/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api/v1/assets': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      '/api/v1/control': {
        target: 'http://localhost:3003',
        changeOrigin: true,
      },
      '/api/v1/rules': {
        target: 'http://localhost:3004',
        changeOrigin: true,
      },
      '/api/v1/alerts': {
        target: 'http://localhost:3004',
        changeOrigin: true,
      },
      '/api/v1/management': {
        target: 'http://localhost:3005',
        changeOrigin: true,
      },
      '/api/v1/production': {
        target: 'http://localhost:3005',
        changeOrigin: true,
      },
      '/api/v1/auth': {
        target: 'http://localhost:3006',
        changeOrigin: true,
      },
      '/api/v1/field': {
        target: 'http://localhost:3006',
        changeOrigin: true,
      },
      '/api/v1/ai': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
})
