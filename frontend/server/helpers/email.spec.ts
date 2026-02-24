// @vitest-environment node
import '../../test/setup-server'
import { describe, it, expect, vi } from 'vitest'
import { emailRenderer, defaultParams } from './email'

const { mockSend, mockCreateTransport } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockCreateTransport: vi.fn().mockReturnValue({ name: 'mock-transport' }),
}))

vi.mock('email-templates', () => {
  return {
    default: class MockEmail {
      send = mockSend
    },
  }
})

vi.mock('nodemailer', () => ({
  createTransport: mockCreateTransport,
}))

vi.mock('../api/redeemLoginLink.post', () => ({
  MAX_AGE: 604800,
}))

describe('email helper', () => {
  it('emailRenderer has send method', () => {
    expect(emailRenderer).toBeDefined()
    expect(typeof emailRenderer.send).toBe('function')
  })

  it('defaultParams contains expected fields', () => {
    expect(defaultParams.APPLICATION_NAME).toBe('Jahrweiser')
    expect(defaultParams.SUPPORT_EMAIL).toBe('hilfe@gg-g.info')
    expect(defaultParams.loginDays).toBe(7)
  })

  it('transport is configured with SMTP config', () => {
    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'localhost',
        port: 1025,
        pool: true,
      }),
    )
  })

  it('includes auth when SMTP credentials are set', async () => {
    mockCreateTransport.mockClear()

    // Override useRuntimeConfig globally, reset modules, and re-import
    const originalUseRuntimeConfig = globalThis.useRuntimeConfig
    globalThis.useRuntimeConfig = (() => ({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: 587,
      SMTP_IGNORE_TLS: false,
      SMTP_SECURE: true,
      SMTP_USERNAME: 'user@smtp.com',
      SMTP_PASSWORD: 'secret',
      SMTP_MAX_CONNECTIONS: 5,
      SMTP_MAX_MESSAGES: 100,
      CLIENT_URI: 'http://localhost:3000',
    })) as typeof globalThis.useRuntimeConfig

    vi.resetModules()
    await import('./email')

    globalThis.useRuntimeConfig = originalUseRuntimeConfig

    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: {
          user: 'user@smtp.com',
          pass: 'secret',
        },
      }),
    )
  })
})
