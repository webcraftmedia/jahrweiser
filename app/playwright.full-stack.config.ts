import { defineConfig } from '@playwright/test'

// Full-stack E2E config. Requires the docker-compose backend stack (mariadb,
// baikal, maildev) to be running before tests start. The app itself is
// spawned by Playwright's webServer below — defaults in nuxt.config.ts point
// at localhost ports so the dev server picks up the right backends.

// Same reason as in playwright.config.ts: on a machine where the dev stack
// already owns 3000, `reuseExistingServer` would quietly test that server.
const PORT = process.env.E2E_PORT ?? '3000'
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`

// `dev` (default) runs `nuxt dev` — quick to start, good for iterating on a
// spec. `prod` builds the app and runs `.output` the way the deploy does, so
// the suite also covers what only exists in the built bundle. CI runs `prod`.
const SERVER = process.env.E2E_SERVER ?? 'dev'
if (SERVER !== 'dev' && SERVER !== 'prod') {
  throw new Error(`E2E_SERVER must be 'dev' or 'prod', got '${SERVER}'`)
}

// Playwright reicht das Kommando an eine Shell weiter — `${VAR:-default}` ist
// damit Shell-Parameter-Expansion, kein verunglücktes Template-Literal.
// BLAETTCHEN_*: die Suite bekommt ihr eigenes Ausgaben-Verzeichnis und eine
// eigene Kontaktadresse, damit sie ein echtes Archiv auf dem Entwickler-
// rechner weder anfasst noch preisgibt — siehe navigation.spec.ts.
// FEEDBACK_*: eigene Zieladresse (landet in maildev) und kein Cooldown,
// damit mehrere Tests hintereinander senden können.
//
// In `prod` these have to be present at build time: nuxt.config.ts reads them
// into runtimeConfig, which the build bakes into `.output`. At runtime only
// `NUXT_*` variables override it — exactly as on the production host, where
// deploy.sh builds with the `.env` in place. The session password is one such
// runtime variable: nuxt-auth-utils invents one under `nuxt dev`, but the built
// server refuses to seal a session without it, and `node` does not read `.env`.
const TEST_ENV =
  // eslint-disable-next-line no-template-curly-in-string
  'TZ=UTC SYNC_SECRET=${SYNC_SECRET:-dev-sync-secret} LOGIN_RATE_LIMIT_MS=0 BLAETTCHEN_DIR=e2e-full-stack/.blaettchen BLAETTCHEN_CONTACT_EMAIL=redaktion@example.com FEEDBACK_EMAIL=feedback@example.com FEEDBACK_RATE_LIMIT_MS=0'

const SESSION_PASSWORD =
  // eslint-disable-next-line no-template-curly-in-string
  'NUXT_SESSION_PASSWORD=${NUXT_SESSION_PASSWORD:-e2e-full-stack-session-password-0123}'

const COMMAND = {
  dev: `cross-env ${TEST_ENV} NODE_ENV=test npm run dev -- --port ${PORT}`,
  prod: `cross-env ${TEST_ENV} nuxt build && cross-env ${TEST_ENV} ${SESSION_PASSWORD} PORT=${PORT} node .output/server/index.mjs`,
}[SERVER]

export default defineConfig({
  testDir: './e2e-full-stack',
  fullyParallel: false, // tests share the seeded stack
  workers: 1,
  // Above Playwright's 30s default, and deliberately more than the cold-start
  // budget a single login may use (`COLD_START_MS` in helpers/session.ts):
  // a test whose per-test budget is the same as the budget of one step inside
  // it cannot fail with a useful message — it only ever times out.
  timeout: 60_000,
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
    command: COMMAND,
    url: BASE_URL,
    // A production build alone takes a minute or two on a CI runner.
    timeout: SERVER === 'prod' ? 300_000 : 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
