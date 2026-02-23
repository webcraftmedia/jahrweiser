import { vi } from 'vitest'
import { createError, defineEventHandler } from 'h3'

// Runtime config shared between vi.mock and globalThis
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

// Mock nuxt's auto-import of useRuntimeConfig (source: #app/nuxt)
// which resolves to nuxt/dist/app/nuxt.js and requires a Nuxt instance
vi.mock('#app/nuxt', () => ({
  useNuxtApp: () => ({}),
  useRuntimeConfig: () => runtimeConfig,
}))

// Provide Nitro auto-imports as globals for server-side tests
globalThis.defineEventHandler = defineEventHandler
globalThis.createError = createError

// readValidatedBody must be a vi.fn() so tests can mock its implementation
globalThis.readValidatedBody = vi.fn()

globalThis.useRuntimeConfig = () =>
  runtimeConfig as unknown as ReturnType<typeof useRuntimeConfig>

globalThis.requireUserSession = vi.fn()
globalThis.setUserSession = vi.fn()
