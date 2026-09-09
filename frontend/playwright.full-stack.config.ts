import { defineConfig } from '@playwright/test'

// Full-stack E2E config. Requires the docker-compose backend stack (mariadb,
// baikal, maildev) to be running before tests start. The frontend itself is
// spawned by Playwright's webServer below — defaults in nuxt.config.ts point
// at localhost ports so the dev server picks up the right backends.

// Same reason as in playwright.config.ts: on a machine where the dev stack
// already owns 3000, `reuseExistingServer` would quietly test that server.
const PORT = process.env.E2E_PORT ?? '3000'
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e-full-stack',
  fullyParallel: false, // tests share the seeded stack
  workers: 1,
  retries: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
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
    // Playwright reicht das Kommando an eine Shell weiter — `${VAR:-default}` ist
    // damit Shell-Parameter-Expansion, kein verunglücktes Template-Literal.
    // BLAETTCHEN_*: die Suite bekommt ihr eigenes Ausgaben-Verzeichnis und eine
    // eigene Kontaktadresse, damit sie ein echtes Archiv auf dem Entwickler-
    // rechner weder anfasst noch preisgibt — siehe navigation.spec.ts.
    command:
      // eslint-disable-next-line no-template-curly-in-string
      'cross-env TZ=UTC SYNC_SECRET=${SYNC_SECRET:-dev-sync-secret} LOGIN_RATE_LIMIT_MS=0 BLAETTCHEN_DIR=e2e-full-stack/.blaettchen BLAETTCHEN_CONTACT_EMAIL=redaktion@example.com NODE_ENV=test npm run dev -- --port ' +
      PORT,
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
