import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import mkcert from 'vite-plugin-mkcert'

export default defineConfig({
  // mkcert serves the dev server over https://localhost:5173 with a
  // locally-trusted cert (via the system mkcert CA) — required because
  // Enable Banking rejects http:// redirect URLs, even for localhost.
  plugins: [react(), mkcert()],
  optimizeDeps: {
    include: ['react-plotly.js', 'plotly.js'],
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
  build: {
    outDir: '../backend/static/dist',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
  },
})
