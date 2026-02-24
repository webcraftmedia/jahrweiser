import { createError, defineEventHandler } from 'h3'
import { vi } from 'vitest'

// Server tests run in @vitest-environment node (set in each test file).
// The auto-import transform from @nuxt/test-utils still resolves
// useRuntimeConfig to #app/nuxt, so we mock it here.
// In node environment (no Nuxt app), this is safe.

const runtimeConfig = vi.hoisted(() => ({
  DAV_USERNAME: 'testuser',
  DAV_PASSWORD: 'testpass',
  DAV_URL: 'https://dav.example.com',
  DAV_URL_CARD: 'https://dav.example.com/card',
  SMTP_HOST: 'localhost',
  SMTP_PORT: 1025,
  SMTP_IGNORE_TLS: true,
  SMTP_SECURE: false,
  SMTP_USERNAME: '',
  SMTP_PASSWORD: '',
  SMTP_MAX_CONNECTIONS: 5,
  SMTP_MAX_MESSAGES: 100,
  CLIENT_URI: 'http://localhost:3000',
}))

vi.mock('#app/nuxt', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    // Delegate to globalThis so tests can override useRuntimeConfig dynamically
    useRuntimeConfig: () => globalThis.useRuntimeConfig(),
  }
})

// Provide Nitro auto-imports as globals for server-side tests
globalThis.defineEventHandler = defineEventHandler
globalThis.createError = createError

// readValidatedBody must be a vi.fn() so tests can mock its implementation
globalThis.readValidatedBody = vi.fn()

globalThis.useRuntimeConfig = () => runtimeConfig as unknown as ReturnType<typeof useRuntimeConfig>

globalThis.requireUserSession = vi.fn()
globalThis.setUserSession = vi.fn()
