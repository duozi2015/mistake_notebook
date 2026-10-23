/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 2533, proxy: { '/api': 'http://localhost:2531', '/uploads': 'http://localhost:2531' } },
  test: {
    environment: 'node',
  },
})