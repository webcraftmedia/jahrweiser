// @vitest-environment node
import '../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockVCard } from '../../test/fixtures/vcard-data'
import handler from './requestLoginLink.post'

const mockFindUserByEmail = vi.fn()
const mockSaveUser = vi.fn()
const mockCreateCardDAVAccount = vi.fn().mockReturnValue({ accountType: 'carddav' })

vi.mock('../helpers/dav', () => ({
  createCardDAVAccount: (...args: unknown[]) => mockCreateCardDAVAccount(...args),
  findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
  saveUser: (...args: unknown[]) => mockSaveUser(...args),
  X_LOGIN_DISABLED: 'x-login-disabled',
  X_LOGIN_REQUEST_TIME: 'x-login-request-time',
  X_LOGIN_TOKEN: 'x-login-token',
}))

const mockEmailSend = vi.fn()
vi.mock('../helpers/email', () => ({
  emailRenderer: { send: (...args: unknown[]) => mockEmailSend(...args) },
  defaultParams: { APPLICATION_NAME: 'Jahrweiser', SUPPORT_EMAIL: 'test@test.com', loginDays: 7 },
}))

const handlerFn = handler as unknown as (event: unknown) => Promise<unknown>

describe('requestLoginLink.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock readValidatedBody to return the email
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_event, validator) => {
      return (validator as (data: unknown) => unknown)({ email: 'test@example.com' })
    })
  })

  it('returns {} when user not found', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockFindUserByEmail.mockResolvedValue(false)
    const result = await handlerFn({})
    expect(result).toEqual({})
    expect(consoleSpy).toHaveBeenCalledWith('user not found')
    consoleSpy.mockRestore()
  })

  it('returns {} when account disabled', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const vcard = createMockVCard({
      email: 'test@example.com',
      fn: 'Test',
      disabled: 'true',
    })
    mockFindUserByEmail.mockResolvedValue({
      user: { href: '/abc.vcf', props: { getetag: '"etag"' } },
      vcard,
    })
    const result = await handlerFn({})
    expect(result).toEqual({})
    expect(consoleSpy).toHaveBeenCalledWith('account disabled')
    consoleSpy.mockRestore()
  })

  it('returns {} when rate-limited (< 60s)', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const vcard = createMockVCard({
      email: 'test@example.com',
      fn: 'Test',
      requestTime: Date.now(),
    })
    mockFindUserByEmail.mockResolvedValue({
      user: { href: '/abc.vcf', props: { getetag: '"etag"' } },
      vcard,
    })
    const result = await handlerFn({})
    expect(result).toEqual({})
    expect(consoleSpy).toHaveBeenCalledWith('too many requests')
    consoleSpy.mockRestore()
  })

  it('saves token and sends email on success', async () => {
    const vcard = createMockVCard({
      email: 'test@example.com',
      fn: 'Test User',
      requestTime: Date.now() - 120000,
    })
    mockFindUserByEmail.mockResolvedValue({
      user: { href: '/abc.vcf', props: { getetag: '"etag"' } },
      vcard,
    })
    mockSaveUser.mockResolvedValue(undefined)
    mockEmailSend.mockResolvedValue(undefined)

    const result = await handlerFn({})
    expect(result).toEqual({})
    expect(mockSaveUser).toHaveBeenCalled()
    expect(mockEmailSend).toHaveBeenCalled()
  })

  it('sends email with empty name when fn is null', async () => {
    const vcard = createMockVCard({
      email: 'test@example.com',
      requestTime: Date.now() - 120000,
    })
    mockFindUserByEmail.mockResolvedValue({
      user: { href: '/abc.vcf', props: { getetag: '"etag"' } },
      vcard,
    })
    mockSaveUser.mockResolvedValue(undefined)
    mockEmailSend.mockResolvedValue(undefined)

    const result = await handlerFn({})
    expect(result).toEqual({})
    expect(mockEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({
          to: expect.objectContaining({ name: '' }),
        }),
      }),
    )
  })

  it('throws error when email sending fails', async () => {
    const vcard = createMockVCard({
      email: 'test@example.com',
      fn: 'Test User',
      requestTime: Date.now() - 120000,
    })
    mockFindUserByEmail.mockResolvedValue({
      user: { href: '/abc.vcf', props: { getetag: '"etag"' } },
      vcard,
    })
    mockSaveUser.mockResolvedValue(undefined)
    mockEmailSend.mockRejectedValue('SMTP error')

    await expect(handlerFn({})).rejects.toThrow()
  })
})
