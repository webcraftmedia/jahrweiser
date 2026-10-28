import { createError, defineEventHandler } from 'h3'
import { vi } from 'vitest'

import type * as h3 from 'h3'
import type { useStorage } from 'nitropack/runtime'
import type { RuntimeConfig } from 'nuxt/schema'
import type { Mock } from 'vitest'

// Not reachable through the package's `exports`; the same path Nuxt's
// generated nitro-imports.d.ts uses.
type Session = typeof import('../node_modules/nuxt-auth-utils/dist/runtime/server/utils/session')

/**
 * The Nitro auto-imports the server code under test calls as globals.
 *
 * Nitro declares them as global `const`s, which never appear on
 * `typeof globalThis` — so `globalThis.requireUserSession` does not typecheck,
 * and declaring a matching `var` would collide with those `const`s. Specs go
 * through this view instead and get the real signatures, which keeps a mock's
 * shape tied to what the server actually calls.
 */
interface NitroGlobals {
  defineEventHandler: typeof h3.defineEventHandler
  createError: typeof h3.createError
  readValidatedBody: Mock<typeof h3.readValidatedBody>
  readMultipartFormData: Mock<typeof h3.readMultipartFormData>
  // Specs stub only what the code under test reads: a storage with getItem,
  // a config with the keys that matter to the case.
  useStorage: Mock<
    (...args: Parameters<typeof useStorage>) => Partial<ReturnType<typeof useStorage>>
  >
  useRuntimeConfig: () => Partial<RuntimeConfig>
  requireUserSession: Mock<Session['requireUserSession']>
  setUserSession: Mock<Session['setUserSession']>
  getUserSession: Mock<Session['getUserSession']>
  clearUserSession: Mock<Session['clearUserSession']>
  getQuery: Mock<typeof h3.getQuery>
  getRouterParam: Mock<typeof h3.getRouterParam>
  getHeader: Mock<typeof h3.getHeader>
  getRequestIP: Mock<typeof h3.getRequestIP>
  setHeader: Mock<typeof h3.setHeader>
  setResponseStatus: Mock<typeof h3.setResponseStatus>
  getCookie: Mock<typeof h3.getCookie>
  setCookie: Mock<typeof h3.setCookie>
  deleteCookie: Mock<typeof h3.deleteCookie>
}

export const nitro = globalThis as unknown as NitroGlobals

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
  LOGIN_RATE_LIMIT_MS: 60000,
  SYNC_SECRET: 'test-sync-secret',
  BLAETTCHEN_DIR: 'data/blaettchen',
  BLAETTCHEN_CONTACT_EMAIL: 'redaktion@example.com',
  FEEDBACK_EMAIL: 'feedback@example.com',
  FEEDBACK_RATE_LIMIT_MS: 60000,
  APP_TIMEZONE: 'Europe/Berlin',
}))

vi.mock('#app/nuxt', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    // Delegate to globalThis so tests can override useRuntimeConfig dynamically.
    // Not via `nitro`: vi.mock factories are hoisted above its declaration.
    useRuntimeConfig: () => (globalThis as unknown as NitroGlobals).useRuntimeConfig(),
  }
})

// Provide Nitro auto-imports as globals for server-side tests
nitro.defineEventHandler = defineEventHandler
nitro.createError = createError

// readValidatedBody must be a vi.fn() so tests can mock its implementation
nitro.readValidatedBody = vi.fn()

// Multipart uploads (the Blättchen issues) — tests supply the parsed parts.
nitro.readMultipartFormData = vi.fn()

// Nitro's server-asset storage (the member map's postal-code geometry).
nitro.useStorage = vi.fn()

nitro.useRuntimeConfig = () => runtimeConfig

nitro.requireUserSession = vi.fn()
nitro.setUserSession = vi.fn()
nitro.getUserSession = vi.fn()
nitro.clearUserSession = vi.fn()

// h3 request/response helpers used by the endpoints. Tests control the request
// ones (getQuery/getRouterParam/getHeader) and ignore the response side-effects.
nitro.getQuery = vi.fn()
nitro.getRouterParam = vi.fn()
nitro.getHeader = vi.fn()
// The audit trail's only use for the request object (server/helpers/events.ts).
nitro.getRequestIP = vi.fn()
nitro.setHeader = vi.fn()
nitro.setResponseStatus = vi.fn()
// The login code's binding cookie (server/helpers/loginCode.ts).
nitro.getCookie = vi.fn()
nitro.setCookie = vi.fn()
nitro.deleteCookie = vi.fn()
