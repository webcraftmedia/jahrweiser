// @vitest-environment node
import '../../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockVCard } from '../../../test/fixtures/vcard-data'
import handler from './updateUserTags.post'

const mockFindUserByEmail = vi.fn()
const mockSaveUser = vi.fn()
const mockCreateUser = vi.fn()
const mockCreateCardDAVAccount = vi.fn().mockReturnValue({ accountType: 'carddav' })

vi.mock('~~/server/helpers/dav', () => ({
  createCardDAVAccount: (...args: unknown[]) => mockCreateCardDAVAccount(...args),
  findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
  saveUser: (...args: unknown[]) => mockSaveUser(...args),
  createUser: (...args: unknown[]) => mockCreateUser(...args),
  X_ADMIN_TAGS: 'x-admin-tags',
}))

const mockEmailSend = vi.fn()
vi.mock('~~/server/helpers/email', () => ({
  emailRenderer: { send: (...args: unknown[]) => mockEmailSend(...args) },
  defaultParams: { APPLICATION_NAME: 'Jahrweiser', SUPPORT_EMAIL: 'test@test.com', loginDays: 7 },
}))

const handlerFn = handler as unknown as (event: unknown) => Promise<unknown>

describe('updateUserTags.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function setupAdmin() {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { name: 'Admin User', email: 'admin@example.com', role: 'admin' },
    } as never)
    const adminVcard = createMockVCard({ email: 'admin@example.com', adminTags: 'Tag1,Tag2,Tag3' })
    mockFindUserByEmail.mockResolvedValueOnce({
      user: { href: '/admin.vcf' },
      vcard: adminVcard,
    })
  }

  it('throws when not admin', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { name: 'Test', email: 'test@example.com', role: 'user' },
    } as never)
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_event, validator) => {
      return (validator as (data: unknown) => unknown)({
        email: 'user@example.com',
        tags: [],
        sendMail: false,
      })
    })
    await expect(handlerFn({})).rejects.toThrow('Not Authorized')
  })

  it('throws when admin not found in DAV', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { name: 'Admin', email: 'admin@example.com', role: 'admin' },
    } as never)
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_event, validator) => {
      return (validator as (data: unknown) => unknown)({
        email: 'user@example.com',
        tags: [],
        sendMail: false,
      })
    })
    mockFindUserByEmail.mockResolvedValue(false)
    await expect(handlerFn({})).rejects.toThrow('Huston, we have a problem')
  })

  it('handles admin with no adminTags (empty fallback)', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { name: 'Admin', email: 'admin@example.com', role: 'admin' },
    } as never)
    const adminVcard = createMockVCard({ email: 'admin@example.com' }) // no adminTags
    mockFindUserByEmail.mockResolvedValueOnce({
      user: { href: '/admin.vcf' },
      vcard: adminVcard,
    })
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_event, validator) => {
      return (validator as (data: unknown) => unknown)({
        email: 'new@example.com',
        tags: [{ name: 'Tag1', state: true }],
        sendMail: false,
      })
    })
    mockFindUserByEmail.mockResolvedValueOnce(false)
    mockCreateUser.mockResolvedValue(undefined)

    const result = await handlerFn({})
    expect(result).toBe(false)
    // Tag1 is filtered out because admin has no admin tags — no tags match
    expect(mockCreateUser).toHaveBeenCalled()
  })

  it('creates new user with filtered tags', async () => {
    setupAdmin()
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_event, validator) => {
      return (validator as (data: unknown) => unknown)({
        email: 'new@example.com',
        tags: [
          { name: 'Tag1', state: true },
          { name: 'Tag2', state: false },
        ],
        sendMail: false,
      })
    })
    mockFindUserByEmail.mockResolvedValueOnce(false) // user not found
    mockCreateUser.mockResolvedValue(undefined)

    const result = await handlerFn({})
    expect(result).toBe(false)
    expect(mockCreateUser).toHaveBeenCalled()
  })

  it('adds tag to existing user', async () => {
    setupAdmin()
    const userVcard = createMockVCard({ email: 'user@example.com', categories: ['Tag1'] })
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_event, validator) => {
      return (validator as (data: unknown) => unknown)({
        email: 'user@example.com',
        tags: [
          { name: 'Tag1', state: true },
          { name: 'Tag2', state: true },
        ],
        sendMail: false,
      })
    })
    mockFindUserByEmail.mockResolvedValueOnce({
      user: { href: '/user.vcf', props: { getetag: '"etag"' } },
      vcard: userVcard,
    })
    mockSaveUser.mockResolvedValue(undefined)

    const result = await handlerFn({})
    expect(result).toBe(false)
    expect(mockSaveUser).toHaveBeenCalled()
    // Verify Tag2 was added
    const savedVcard = userVcard
    const categories = savedVcard.getFirstProperty('categories')?.getValues() as string[]
    expect(categories).toContain('Tag2')
  })

  it('removes tag from existing user', async () => {
    setupAdmin()
    const userVcard = createMockVCard({
      email: 'user@example.com',
      categories: ['Tag1', 'Tag2'],
    })
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_event, validator) => {
      return (validator as (data: unknown) => unknown)({
        email: 'user@example.com',
        tags: [
          { name: 'Tag1', state: true },
          { name: 'Tag2', state: false },
        ],
        sendMail: false,
      })
    })
    mockFindUserByEmail.mockResolvedValueOnce({
      user: { href: '/user.vcf', props: { getetag: '"etag"' } },
      vcard: userVcard,
    })
    mockSaveUser.mockResolvedValue(undefined)

    await handlerFn({})
    const categories = userVcard.getFirstProperty('categories')?.getValues() as string[]
    expect(categories).not.toContain('Tag2')
    expect(categories).toContain('Tag1')
  })

  it('sends email and returns true when sendMail=true and new tags exist', async () => {
    setupAdmin()
    const userVcard = createMockVCard({ email: 'user@example.com', categories: ['Tag1'] })
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_event, validator) => {
      return (validator as (data: unknown) => unknown)({
        email: 'user@example.com',
        tags: [
          { name: 'Tag1', state: true },
          { name: 'Tag2', state: true },
        ],
        sendMail: true,
      })
    })
    mockFindUserByEmail.mockResolvedValueOnce({
      user: { href: '/user.vcf', props: { getetag: '"etag"' } },
      vcard: userVcard,
    })
    mockSaveUser.mockResolvedValue(undefined)
    mockEmailSend.mockResolvedValue(undefined)

    const result = await handlerFn({})
    expect(result).toBe(true)
    expect(mockEmailSend).toHaveBeenCalled()
  })

  it('returns false when sendMail=true but no new tags', async () => {
    setupAdmin()
    const userVcard = createMockVCard({
      email: 'user@example.com',
      categories: ['Tag1', 'Tag2'],
    })
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_event, validator) => {
      return (validator as (data: unknown) => unknown)({
        email: 'user@example.com',
        tags: [
          { name: 'Tag1', state: true },
          { name: 'Tag2', state: true },
        ],
        sendMail: true,
      })
    })
    mockFindUserByEmail.mockResolvedValueOnce({
      user: { href: '/user.vcf', props: { getetag: '"etag"' } },
      vcard: userVcard,
    })
    mockSaveUser.mockResolvedValue(undefined)

    const result = await handlerFn({})
    expect(result).toBe(false)
    expect(mockEmailSend).not.toHaveBeenCalled()
  })

  it('returns false when sendMail=false', async () => {
    setupAdmin()
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_event, validator) => {
      return (validator as (data: unknown) => unknown)({
        email: 'new@example.com',
        tags: [{ name: 'Tag1', state: true }],
        sendMail: false,
      })
    })
    mockFindUserByEmail.mockResolvedValueOnce(false) // user not found
    mockCreateUser.mockResolvedValue(undefined)

    const result = await handlerFn({})
    expect(result).toBe(false)
    expect(mockEmailSend).not.toHaveBeenCalled()
  })

  it('uses email as adminName when session has no name', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { name: '', email: 'admin@example.com', role: 'admin' },
    } as never)
    const adminVcard = createMockVCard({ email: 'admin@example.com', adminTags: 'Tag1,Tag2,Tag3' })
    mockFindUserByEmail.mockResolvedValueOnce({
      user: { href: '/admin.vcf' },
      vcard: adminVcard,
    })
    const userVcard = createMockVCard({ email: 'user@example.com', categories: ['Tag1'] })
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_event, validator) => {
      return (validator as (data: unknown) => unknown)({
        email: 'user@example.com',
        tags: [{ name: 'Tag2', state: true }],
        sendMail: true,
      })
    })
    mockFindUserByEmail.mockResolvedValueOnce({
      user: { href: '/user.vcf', props: { getetag: '"etag"' } },
      vcard: userVcard,
    })
    mockSaveUser.mockResolvedValue(undefined)
    mockEmailSend.mockResolvedValue(undefined)

    const result = await handlerFn({})
    expect(result).toBe(true)
    expect(mockEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        locals: expect.objectContaining({
          adminName: 'admin@example.com',
        }),
      }),
    )
  })

  it('throws when email sending fails', async () => {
    setupAdmin()
    const userVcard = createMockVCard({ email: 'user@example.com', categories: ['Tag1'] })
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_event, validator) => {
      return (validator as (data: unknown) => unknown)({
        email: 'user@example.com',
        tags: [{ name: 'Tag2', state: true }],
        sendMail: true,
      })
    })
    mockFindUserByEmail.mockResolvedValueOnce({
      user: { href: '/user.vcf', props: { getetag: '"etag"' } },
      vcard: userVcard,
    })
    mockSaveUser.mockResolvedValue(undefined)
    mockEmailSend.mockRejectedValue('SMTP error')

    await expect(handlerFn({})).rejects.toThrow()
  })
})
