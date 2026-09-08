// @vitest-environment node
import '../../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { createMockVCard } from '../../../test/fixtures/vcard-data'

import handler from './grantable-calendars.get'

const mockFindUserByEmail = vi.fn()

// Only the DAV I/O is mocked; readAdminTags stays real.
vi.mock('~~/server/helpers/dav', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~~/server/helpers/dav')>()),
  createCardDAVAccount: () => ({ accountType: 'carddav' }),
  findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
}))

const handlerFn = handler as unknown as (event: unknown) => Promise<string[]>

function asAdmin() {
  vi.mocked(globalThis.requireUserSession).mockResolvedValue({
    user: { uid: 'admin-1', name: 'Admin', email: 'admin@example.com', role: 'admin' },
  })
}

describe('admin/grantable-calendars', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects non-admins', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'u1', name: 'User', email: 'user@example.com', role: 'user' },
    })
    await expect(handlerFn({})).rejects.toThrow('Not Authorized')
  })

  it("returns the admin's own X-ADMIN-TAGS", async () => {
    // Deliberately not every calendar on the server: an admin may only hand out
    // what they administer.
    asAdmin()
    mockFindUserByEmail.mockResolvedValue({
      user: { href: '/admin.vcf' },
      vcard: createMockVCard({ email: 'admin@example.com', adminTags: 'Chor,Vorstand' }),
    })
    await expect(handlerFn({})).resolves.toStrictEqual(['Chor', 'Vorstand'])
  })

  it('returns an empty list when the admin administers no calendar', async () => {
    asAdmin()
    mockFindUserByEmail.mockResolvedValue({
      user: { href: '/admin.vcf' },
      vcard: createMockVCard({ email: 'admin@example.com' }),
    })
    await expect(handlerFn({})).resolves.toStrictEqual([])
  })

  it('throws when the admin has no DAV contact', async () => {
    asAdmin()
    mockFindUserByEmail.mockResolvedValue(false)
    await expect(handlerFn({})).rejects.toThrow('Admin account not found')
  })
})
