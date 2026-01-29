import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'https://mmh-delivery.onrender.com',
        changeOrigin: true,
      }
    }
  },
  preview: {
    port: process.env.PORT || 4173,
    host: '0.0.0.0',
    strictPort: true,
    cors: true,
  }
})
