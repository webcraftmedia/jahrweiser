import { defineConfig } from '@playwright/test'

// Full-stack E2E config. Assumes the docker-compose stack (mariadb, baikal,
// maildev) is up and the frontend has been started with real env vars pointing
// at those services. See docu/testing.md for the start-up sequence.

export default defineConfig({
  testDir: './e2e-full-stack',
  fullyParallel: false, // tests share the seeded stack
  workers: 1,
  retries: process.env.CI ? 2 : 1,
  reporter: 'list',
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
})
