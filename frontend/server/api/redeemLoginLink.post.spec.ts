// @vitest-environment node
import '../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockVCard } from '../../test/fixtures/vcard-data'
import handler, { MAX_AGE } from './redeemLoginLink.post'

const mockFindUserByToken = vi.fn()
const mockSaveUser = vi.fn()
const mockCreateCardDAVAccount = vi.fn().mockReturnValue({ accountType: 'carddav' })

vi.mock('../helpers/dav', () => ({
  createCardDAVAccount: (...args: unknown[]) => mockCreateCardDAVAccount(...args),
  findUserByToken: (...args: unknown[]) => mockFindUserByToken(...args),
  saveUser: (...args: unknown[]) => mockSaveUser(...args),
  X_LOGIN_DISABLED: 'x-login-disabled',
  X_LOGIN_REQUEST_TIME: 'x-login-request-time',
  X_LOGIN_TIME: 'x-login-time',
  X_LOGIN_TOKEN: 'x-login-token',
  X_ROLE: 'x-role',
}))

const handlerFn = handler as unknown as (event: unknown) => Promise<unknown>

describe('redeemLoginLink.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_event, validator) => {
      return (validator as (data: unknown) => unknown)({ token: 'valid-token' })
    })
  })

  it('exports MAX_AGE = 604800', () => {
    expect(MAX_AGE).toBe(604800)
  })

  it('throws 401 when user not found', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockFindUserByToken.mockResolvedValue(false)
    await expect(handlerFn({})).rejects.toMatchObject({
      statusCode: 401,
    })
    expect(consoleSpy).toHaveBeenCalledWith('user not found')
    consoleSpy.mockRestore()
  })

  it('throws 401 when account disabled', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const vcard = createMockVCard({
      email: 'test@example.com',
      fn: 'Test',
      token: 'valid-token',
      disabled: 'true',
    })
    mockFindUserByToken.mockResolvedValue({
      user: { href: '/abc.vcf', props: { getetag: '"etag"' } },
      vcard,
    })
    await expect(handlerFn({})).rejects.toMatchObject({
      statusCode: 401,
    })
    expect(consoleSpy).toHaveBeenCalledWith('account disabled')
    consoleSpy.mockRestore()
  })

  it('removes token, sets session and returns {} on success', async () => {
    const vcard = createMockVCard({
      email: 'test@example.com',
      fn: 'Test User',
      token: 'valid-token',
      role: 'user',
    })
    mockFindUserByToken.mockResolvedValue({
      user: { href: '/abc.vcf', props: { getetag: '"etag"' } },
      vcard,
    })
    mockSaveUser.mockResolvedValue(undefined)

    const event = {}
    const result = await handlerFn(event)
    expect(result).toStrictEqual({})
    expect(mockSaveUser).toHaveBeenCalled()
    expect(globalThis.setUserSession).toHaveBeenCalledWith(
      event,
      expect.objectContaining({
        user: expect.objectContaining({
          name: 'Test User',
          email: 'test@example.com',
          role: 'user',
        }),
      }),
      { maxAge: MAX_AGE },
    )
  })

  it('defaults role to user when x-role not set', async () => {
    const vcard = createMockVCard({
      email: 'user@example.com',
      fn: 'Regular User',
      token: 'valid-token',
    })
    mockFindUserByToken.mockResolvedValue({
      user: { href: '/abc.vcf', props: { getetag: '"etag"' } },
      vcard,
    })
    mockSaveUser.mockResolvedValue(undefined)

    await handlerFn({})
    const sessionCall = vi.mocked(globalThis.setUserSession).mock.calls[0]!
    expect(sessionCall[1]).toStrictEqual({
      user: { name: 'Regular User', email: 'user@example.com', role: 'user' },
    })
  })

  it('session contains name, email, and role', async () => {
    const vcard = createMockVCard({
      email: 'admin@example.com',
      fn: 'Admin User',
      token: 'valid-token',
      role: 'admin',
    })
    mockFindUserByToken.mockResolvedValue({
      user: { href: '/abc.vcf', props: { getetag: '"etag"' } },
      vcard,
    })
    mockSaveUser.mockResolvedValue(undefined)

    await handlerFn({})
    const sessionCall = vi.mocked(globalThis.setUserSession).mock.calls[0]!
    expect(sessionCall[1]).toStrictEqual({
      user: { name: 'Admin User', email: 'admin@example.com', role: 'admin' },
    })
  })
})
