import '../../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockVCard } from '../../../test/fixtures/vcard-data'
import handler from './getUserTags.post'

const mockFindUserByEmail = vi.fn()
const mockCreateCardDAVAccount = vi.fn().mockReturnValue({ accountType: 'carddav' })

vi.mock('~~/server/helpers/dav', () => ({
  createCardDAVAccount: (...args: unknown[]) => mockCreateCardDAVAccount(...args),
  findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
  X_ADMIN_TAGS: 'x-admin-tags',
}))

const handlerFn = handler as unknown as (event: unknown) => Promise<unknown>

describe('getUserTags.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_event, validator) => {
      return (validator as (data: unknown) => unknown)({ email: 'user@example.com' })
    })
  })

  it('throws when not admin', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { name: 'Test', email: 'test@example.com', role: 'user' },
    } as never)
    await expect(handlerFn({})).rejects.toThrow('Not Authorized')
  })

  it('throws when admin not found in DAV', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { name: 'Admin', email: 'admin@example.com', role: 'admin' },
    } as never)
    mockFindUserByEmail.mockResolvedValue(false)
    await expect(handlerFn({})).rejects.toThrow('Huston, we have a problem')
  })

  it('returns empty array when admin has no adminTags', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { name: 'Admin', email: 'admin@example.com', role: 'admin' },
    } as never)
    const adminVcard = createMockVCard({ email: 'admin@example.com' })

    mockFindUserByEmail
      .mockResolvedValueOnce({
        user: { href: '/admin.vcf' },
        vcard: adminVcard,
      })
      .mockResolvedValueOnce(false)

    const result = (await handlerFn({})) as { name: string; state: boolean }[]
    expect(result).toEqual([])
  })

  it('returns all tags with state:false when user not found', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { name: 'Admin', email: 'admin@example.com', role: 'admin' },
    } as never)
    const adminVcard = createMockVCard({ email: 'admin@example.com', adminTags: 'Tag1,Tag2' })

    // First call: admin lookup; Second call: user lookup
    mockFindUserByEmail
      .mockResolvedValueOnce({
        user: { href: '/admin.vcf' },
        vcard: adminVcard,
      })
      .mockResolvedValueOnce(false)

    const result = (await handlerFn({})) as { name: string; state: boolean }[]
    expect(result).toEqual([
      { name: 'Tag1', state: false },
      { name: 'Tag2', state: false },
    ])
  })

  it('returns tags with correct state when user found', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { name: 'Admin', email: 'admin@example.com', role: 'admin' },
    } as never)
    const adminVcard = createMockVCard({ email: 'admin@example.com', adminTags: 'Tag1,Tag2,Tag3' })
    const userVcard = createMockVCard({
      email: 'user@example.com',
      categories: ['Tag1', 'Tag3'],
    })

    mockFindUserByEmail
      .mockResolvedValueOnce({
        user: { href: '/admin.vcf' },
        vcard: adminVcard,
      })
      .mockResolvedValueOnce({
        user: { href: '/user.vcf' },
        vcard: userVcard,
      })

    const result = (await handlerFn({})) as { name: string; state: boolean }[]
    expect(result).toEqual([
      { name: 'Tag1', state: true },
      { name: 'Tag2', state: false },
      { name: 'Tag3', state: true },
    ])
  })
})
