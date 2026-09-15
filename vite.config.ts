import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      proxy: {
        '/api': {
          target: env.API_PROXY_TARGET || 'http://localhost:8080',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
          cookiePathRewrite: '/',
        },
      },
    },
    test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'], restoreMocks: true },
  }
})
