// @vitest-environment node
import '../../../test/setup-server'
import ICAL from 'ical.js'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { mockDb, queueDbResults, resetDb } from '../../../test/helpers/mock-db'

import handler from './profile.post'

const mockFindUserByEmail = vi.fn()
const mockSaveUser = vi.fn()
vi.mock('../../helpers/dav', () => ({
  createCardDAVAccount: vi
    .fn()
    .mockReturnValue({ accountType: 'carddav', serverUrl: 'http://dav' }),
  findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
  saveUser: (...args: unknown[]) => mockSaveUser(...args),
}))
vi.mock('../../db', () => ({ useDb: () => mockDb }))

const fn = handler as unknown as (e: unknown) => Promise<unknown>

function vcard(lines: string[]): ICAL.Component {
  return new ICAL.Component(
    ICAL.parse(['BEGIN:VCARD', 'VERSION:4.0', ...lines, 'END:VCARD'].join('\r\n')),
  )
}

describe('profile.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'u1', name: 'Anna Mustermann', email: 'anna@example.com', role: 'user' },
    })
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_e, v) =>
      (v as (d: unknown) => unknown)({
        firstName: 'Alicia',
        lastName: 'Wonder',
        postalCode: '64653',
      }),
    )
    mockSaveUser.mockResolvedValue({ ok: true })
  })

  it('rejects when the session has no uid', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { name: 'x', email: 'x@x.de', role: 'user' },
    })
    await expect(fn({})).rejects.toThrow('No user context')
  })

  it('returns 404 when the contact is not in DAV', async () => {
    mockFindUserByEmail.mockResolvedValue(false)
    await expect(fn({})).rejects.toThrow('Contact not found')
  })

  it('writes the name and postal code to a vcard that already has a uid', async () => {
    const card = vcard(['UID:u1', 'FN:Old Name', 'N:Name;Old;;;', 'EMAIL:anna@example.com'])
    mockFindUserByEmail.mockResolvedValue({
      user: { href: '/a.vcf', props: { getetag: 'x' } },
      vcard: card,
    })
    queueDbResults({}) // db.update
    const res = await fn({})
    expect(res).toStrictEqual({
      firstName: 'Alicia',
      lastName: 'Wonder',
      postalCode: '64653',
      displayName: 'Alicia Wonder',
    })
    expect(card.toString()).toContain('ADR:;;;;;64653;')
    expect(mockSaveUser).toHaveBeenCalledTimes(1)
  })

  it('fills in a missing uid on legacy contacts', async () => {
    const card = vcard(['EMAIL:anna@example.com'])
    mockFindUserByEmail.mockResolvedValue({ user: { href: '/a.vcf', props: {} }, vcard: card })
    queueDbResults({})
    await fn({})
    expect(card.getFirstPropertyValue('uid')).toBe('u1')
  })
})
