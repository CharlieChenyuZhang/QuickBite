import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { existsSync } from 'node:fs'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const testingEntry = fileURLToPath(new URL('./testing data/index.ts', import.meta.url))
  const hasTestingData = existsSync(testingEntry)
  if (env.VITE_DEMO_MODE === 'true' && !hasTestingData) {
    throw new Error(
      'Demo mode requires the testing data folder. Restore it or run with VITE_DEMO_MODE=false.',
    )
  }
  const useTestingData = hasTestingData && (env.VITE_DEMO_MODE === 'true' || mode === 'test')
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@quickbite/testing-data': useTestingData
          ? testingEntry
          : fileURLToPath(new URL('./src/lib/testing-data-unavailable.ts', import.meta.url)),
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
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
