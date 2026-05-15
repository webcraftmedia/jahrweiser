import { defineConfig } from '@playwright/test'

// Full-stack E2E config. Requires the docker-compose backend stack (mariadb,
// baikal, maildev) to be running before tests start. The frontend itself is
// spawned by Playwright's webServer below — defaults in nuxt.config.ts point
// at localhost ports so the dev server picks up the right backends.

export default defineConfig({
  testDir: './e2e-full-stack',
  fullyParallel: false, // tests share the seeded stack
  workers: 1,
  retries: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    reducedMotion: 'reduce',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command:
      'cross-env TZ=UTC SYNC_SECRET=${SYNC_SECRET:-dev-sync-secret} NODE_ENV=test npm run dev',
    url: 'http://localhost:3000',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
