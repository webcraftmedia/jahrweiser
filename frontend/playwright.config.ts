import { defineConfig } from '@playwright/test'

// Port is overridable because `reuseExistingServer` cannot tell *whose* server
// answers on 3000: with the docker-compose dev stack up, the suite would
// silently run against that one and report on code it never built. CI has the
// port to itself, so the default stays 3000.
const PORT = process.env.E2E_PORT ?? '3000'
const BASE_URL = `http://localhost:${PORT}`

const SERVER_ENV = [
  'NUXT_SESSION_PASSWORD=12345678901234567890123456789012',
  'DAV_URL=http://localhost:123',
  'DAV_USERNAME=username',
  'DAV_PASSWORD=password',
  `CLIENT_URI=${BASE_URL}`,
  `PORT=${PORT}`,
].join(' ')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: BASE_URL,
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
    command: `${SERVER_ENV} npx nuxt build && ${SERVER_ENV} node .output/server/index.mjs`,
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
})
