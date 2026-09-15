import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      testMatch: 'quickbite.spec.ts',
      use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'mobile-chromium',
      testMatch: 'quickbite.spec.ts',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'live-api-chromium',
      testMatch: 'live-api.spec.ts',
      use: {
        browserName: 'chromium',
        baseURL: 'http://127.0.0.1:5174',
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
  webServer: [
    {
      command: 'npm run dev:demo -- --host 127.0.0.1 --port 5173 --strictPort',
      url: 'http://127.0.0.1:5173',
      env: { VITE_DEMO_MODE: 'true' },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -- --mode test --host 127.0.0.1 --port 5174 --strictPort',
      url: 'http://127.0.0.1:5174',
      env: { VITE_DEMO_MODE: 'false', VITE_API_BASE_URL: '/api' },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
})
