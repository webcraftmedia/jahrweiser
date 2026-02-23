import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command:
      'NUXT_SESSION_PASSWORD=12345678901234567890123456789012 DAV_URL=http://localhost:123 DAV_USERNAME=username DAV_PASSWORD=password CLIENT_URI=http://localhost:3000 npx nuxt build && NUXT_SESSION_PASSWORD=12345678901234567890123456789012 DAV_URL=http://localhost:123 DAV_USERNAME=username DAV_PASSWORD=password CLIENT_URI=http://localhost:3000 node .output/server/index.mjs',
    url: 'http://localhost:3000',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
})
