// @vitest-environment node
import '../../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { createMockVCard } from '../../../test/fixtures/vcard-data'

import handler from './getUserTags.post'

const mockFindUserByEmail = vi.fn()
const mockCreateCardDAVAccount = vi.fn().mockReturnValue({ accountType: 'carddav' })
const mockCreateCalDAVAccount = vi.fn().mockReturnValue({ accountType: 'caldav' })
// Tags are calendar keys; the endpoint resolves their display labels from here.
const mockFindCalendars = vi.fn()
const CALENDARS = [
  { displayName: 'Theater AG', url: 'https://dav.example.com/cal/theater-ag' },
  { displayName: 'Sportgruppe', url: 'https://dav.example.com/cal/sportgruppe' },
]

// Only the DAV I/O is mocked; the pure vCard helpers (readAdminTags & co.) stay
// real, so these tests exercise the actual parsing instead of a copy of it.
vi.mock('~~/server/helpers/dav', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~~/server/helpers/dav')>()),
  createCardDAVAccount: (...args: unknown[]) => mockCreateCardDAVAccount(...args),
  createCalDAVAccount: (...args: unknown[]) => mockCreateCalDAVAccount(...args),
  findCalendars: (...args: unknown[]) => mockFindCalendars(...args),
  findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
}))

const handlerFn = handler as unknown as (event: unknown) => Promise<unknown>

describe('getUserTags.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateCalDAVAccount.mockReturnValue({ accountType: 'caldav' })
    mockCreateCardDAVAccount.mockReturnValue({ accountType: 'carddav' })
    mockFindCalendars.mockResolvedValue(CALENDARS)
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_event, validator) => {
      return (validator as (data: unknown) => unknown)({ email: 'user@example.com' })
    })
  })

  it('throws when not admin', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { name: 'Test', email: 'test@example.com', role: 'user' },
    })
    await expect(handlerFn({})).rejects.toThrow('Not Authorized')
  })

  it('throws when admin not found in DAV', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { name: 'Admin', email: 'admin@example.com', role: 'admin' },
    })
    mockFindUserByEmail.mockResolvedValue(false)
    await expect(handlerFn({})).rejects.toThrow('Admin account not found')
  })

  it('falls back to the key when a tag names no existing calendar', async () => {
    // A dangling grant must stay visible in the picker rather than render as a
    // blank checkbox the admin cannot reason about.
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { name: 'Admin', email: 'admin@example.com', role: 'admin' },
    })
    const adminVcard = createMockVCard({ email: 'admin@example.com', adminTags: 'geloescht' })
    mockFindUserByEmail.mockResolvedValueOnce({ user: { href: '/admin.vcf' }, vcard: adminVcard })
    mockFindUserByEmail.mockResolvedValueOnce(false)

    const result = await handlerFn({})
    expect(result).toStrictEqual([{ name: 'geloescht', label: 'geloescht', state: false }])
  })

  it('returns empty array when admin has no adminTags', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { name: 'Admin', email: 'admin@example.com', role: 'admin' },
    })
    const adminVcard = createMockVCard({ email: 'admin@example.com' })

    mockFindUserByEmail
      .mockResolvedValueOnce({
        user: { href: '/admin.vcf' },
        vcard: adminVcard,
      })
      .mockResolvedValueOnce(false)

    const result = (await handlerFn({})) as { name: string; state: boolean }[]
    expect(result).toStrictEqual([])
  })

  it('returns all tags with state:false when user not found', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { name: 'Admin', email: 'admin@example.com', role: 'admin' },
    })
    const adminVcard = createMockVCard({
      email: 'admin@example.com',
      adminTags: 'theater-ag,sportgruppe',
    })

    // First call: admin lookup; Second call: user lookup
    mockFindUserByEmail
      .mockResolvedValueOnce({
        user: { href: '/admin.vcf' },
        vcard: adminVcard,
      })
      .mockResolvedValueOnce(false)

    const result = (await handlerFn({})) as { name: string; state: boolean }[]
    // Tags are calendar keys; `label` carries the display name for the UI.
    expect(result).toStrictEqual([
      { name: 'theater-ag', label: 'Theater AG', state: false },
      { name: 'sportgruppe', label: 'Sportgruppe', state: false },
    ])
  })

  it('returns tags with correct state when user found', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { name: 'Admin', email: 'admin@example.com', role: 'admin' },
    })
    const adminVcard = createMockVCard({
      email: 'admin@example.com',
      adminTags: 'theater-ag,sportgruppe',
    })
    const userVcard = createMockVCard({
      email: 'user@example.com',
      categories: ['theater-ag'],
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
    expect(result).toStrictEqual([
      { name: 'theater-ag', label: 'Theater AG', state: true },
      { name: 'sportgruppe', label: 'Sportgruppe', state: false },
    ])
  })
})
