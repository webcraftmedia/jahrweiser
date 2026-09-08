// @vitest-environment node
import '../../test/setup-server'
import ICAL from 'ical.js'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { createMockVCard } from '../../test/fixtures/vcard-data'

import { readCategories } from './dav'

import {
  buildRegistrantVCard,
  computeExpiresAt,
  fillMissingRegistrantData,
  findGrantableCalendars,
  LINK_DURATION_KEYS,
  LINK_DURATIONS,
  linkStatus,
  narrowCalendarBinding,
} from './registrationLinks'
import { extractUserFromVCardData } from './sync'

const mockFindUserByEmail = vi.fn()
const mockCreateCardDAVAccount = vi.fn().mockReturnValue({ accountType: 'carddav' })

// Only the DAV I/O is mocked; readAdminTags stays real.
vi.mock('./dav', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./dav')>()),
  createCardDAVAccount: (...args: unknown[]) => mockCreateCardDAVAccount(...args),
  findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
}))

const DAV_CONFIG = {
  DAV_USERNAME: 'u',
  DAV_PASSWORD: 'p',
  DAV_URL: 'https://dav.example.com',
  DAV_URL_CARD: 'https://dav.example.com/card',
}

function parseVCard(lines: string[]): ICAL.Component {
  return new ICAL.Component(
    ICAL.parse(['BEGIN:VCARD', 'VERSION:4.0', ...lines, 'END:VCARD'].join('\r\n')),
  )
}

const DAY_MS = 24 * 60 * 60 * 1000

describe('LINK_DURATIONS', () => {
  it('exposes the selectable presets and their key list', () => {
    expect(LINK_DURATIONS).toStrictEqual({ '1d': 1, '7d': 7, '30d': 30, unlimited: null })
    expect(LINK_DURATION_KEYS).toStrictEqual(['1d', '7d', '30d', 'unlimited'])
  })
})

describe('computeExpiresAt', () => {
  const now = 1_700_000_000_000

  it('returns null for the unlimited preset', () => {
    expect(computeExpiresAt('unlimited', now)).toBeNull()
  })

  it('adds the preset number of days to now', () => {
    expect(computeExpiresAt('1d', now)).toStrictEqual(new Date(now + 1 * DAY_MS))
    expect(computeExpiresAt('7d', now)).toStrictEqual(new Date(now + 7 * DAY_MS))
    expect(computeExpiresAt('30d', now)).toStrictEqual(new Date(now + 30 * DAY_MS))
  })
})

describe('linkStatus', () => {
  const now = 1_700_000_000_000

  it('is valid when not revoked, unexpired and under the use cap', () => {
    expect(
      linkStatus({ revokedAt: null, expiresAt: new Date(now + DAY_MS), maxUses: 5 }, 2, now),
    ).toBe('valid')
  })

  it('is valid with no expiry and no use cap', () => {
    expect(linkStatus({ revokedAt: null, expiresAt: null, maxUses: null }, 999, now)).toBe('valid')
  })

  it('reports revoked', () => {
    expect(
      linkStatus({ revokedAt: new Date(now - DAY_MS), expiresAt: null, maxUses: null }, 0, now),
    ).toBe('revoked')
  })

  it('reports expired once expiresAt has passed (inclusive of now)', () => {
    expect(linkStatus({ revokedAt: null, expiresAt: new Date(now), maxUses: null }, 0, now)).toBe(
      'expired',
    )
    expect(
      linkStatus({ revokedAt: null, expiresAt: new Date(now - 1), maxUses: null }, 0, now),
    ).toBe('expired')
  })

  it('reports exhausted once the use count reaches maxUses', () => {
    expect(linkStatus({ revokedAt: null, expiresAt: null, maxUses: 3 }, 3, now)).toBe('exhausted')
    expect(linkStatus({ revokedAt: null, expiresAt: null, maxUses: 3 }, 4, now)).toBe('exhausted')
  })

  it('prioritises revoked over expired over exhausted', () => {
    expect(
      linkStatus(
        { revokedAt: new Date(now - DAY_MS), expiresAt: new Date(now - DAY_MS), maxUses: 1 },
        5,
        now,
      ),
    ).toBe('revoked')
    expect(
      linkStatus({ revokedAt: null, expiresAt: new Date(now - DAY_MS), maxUses: 1 }, 5, now),
    ).toBe('expired')
  })
})

describe('buildRegistrantVCard', () => {
  it('builds a vCard the sync/login path can read back', () => {
    const vcard = buildRegistrantVCard({
      uid: 'uid-123',
      firstName: 'Anna',
      lastName: 'Mustermann',
      email: 'anna@example.com',
    })
    const snap = extractUserFromVCardData(vcard.toString())
    expect(snap).toStrictEqual({
      uid: 'uid-123',
      email: 'anna@example.com',
      displayName: 'Anna Mustermann',
      role: 'user',
      tags: [],
    })
  })

  it('grants the calendar binding as CATEGORIES', () => {
    const vcard = buildRegistrantVCard({
      uid: 'uid-123',
      firstName: 'Anna',
      lastName: 'Mustermann',
      email: 'anna@example.com',
      calendars: ['Chor', 'Vorstand'],
    })
    // CATEGORIES is the private-calendar access server/api/calendar.post.ts
    // checks against. Not to be confused with X-ADMIN-TAGS, which says which
    // calendars a user may hand out and is what sync.ts reads as `tags`.
    expect(readCategories(vcard)).toStrictEqual(['Chor', 'Vorstand'])
  })

  it('adds no CATEGORIES for an unbound link', () => {
    for (const calendars of [undefined, null, []]) {
      const vcard = buildRegistrantVCard({
        uid: 'uid-123',
        firstName: 'Anna',
        lastName: 'Mustermann',
        email: 'anna@example.com',
        calendars,
      })
      expect(vcard.getFirstProperty('categories')).toBeNull()
    }
  })

  it('sets the structured N components (family;given)', () => {
    const vcard = buildRegistrantVCard({
      uid: 'uid-1',
      firstName: 'Anna',
      lastName: 'Mustermann',
      email: 'a@example.com',
    })
    expect(vcard.getFirstProperty('n')?.getValues()).toStrictEqual([
      ['Mustermann', 'Anna', '', '', ''],
    ])
  })

  it('escapes special characters in names safely', () => {
    const vcard = buildRegistrantVCard({
      uid: 'uid-2',
      firstName: 'Jean, Jr.',
      lastName: 'O;Brien',
      email: 'jean@example.com',
    })
    // Round-trips through serialization without corrupting the displayName.
    const snap = extractUserFromVCardData(vcard.toString())
    expect(snap?.displayName).toBe('Jean, Jr. O;Brien')
  })
})

describe('fillMissingRegistrantData', () => {
  it('fills both UID and name when both are missing', () => {
    const vcard = parseVCard(['EMAIL:joe@example.com'])
    const mutated = fillMissingRegistrantData(vcard, {
      uid: 'gen-uid',
      firstName: 'Joe',
      lastName: 'Doe',
    })
    expect(mutated).toBe(true)
    expect(vcard.getFirstPropertyValue('uid')).toBe('gen-uid')
    expect(vcard.getFirstPropertyValue('fn')).toBe('Joe Doe')
    expect(vcard.getFirstProperty('n')?.getValues()).toStrictEqual([['Doe', 'Joe', '', '', '']])
  })

  it('keeps an existing UID and only fills the missing name', () => {
    const vcard = parseVCard(['UID:keep-me', 'EMAIL:joe@example.com'])
    const mutated = fillMissingRegistrantData(vcard, {
      uid: 'gen-uid',
      firstName: 'Joe',
      lastName: 'Doe',
    })
    expect(mutated).toBe(true)
    expect(vcard.getFirstPropertyValue('uid')).toBe('keep-me')
    expect(vcard.getFirstPropertyValue('fn')).toBe('Joe Doe')
  })

  it('does not overwrite an existing name and leaves an existing N untouched', () => {
    const vcard = parseVCard(['UID:keep', 'FN:Existing Name', 'N:Name;Existing;;;', 'EMAIL:e@x.de'])
    const mutated = fillMissingRegistrantData(vcard, {
      uid: 'gen-uid',
      firstName: 'New',
      lastName: 'Person',
    })
    expect(mutated).toBe(false)
    expect(vcard.getFirstPropertyValue('fn')).toBe('Existing Name')
    expect(vcard.getFirstProperty('n')?.getValues()).toStrictEqual([
      ['Name', 'Existing', '', '', ''],
    ])
  })

  it('fills the name but keeps a pre-existing N component', () => {
    // FN missing but a structured N already present — fill FN, leave N as-is.
    const vcard = parseVCard(['UID:keep', 'N:Surname;Given;;;', 'EMAIL:e@x.de'])
    const mutated = fillMissingRegistrantData(vcard, {
      uid: 'gen-uid',
      firstName: 'New',
      lastName: 'Person',
    })
    expect(mutated).toBe(true)
    expect(vcard.getFirstPropertyValue('fn')).toBe('New Person')
    expect(vcard.getFirstProperty('n')?.getValues()).toStrictEqual([
      ['Surname', 'Given', '', '', ''],
    ])
  })

  it('treats a blank FN as missing', () => {
    const vcard = parseVCard(['UID:keep', 'FN: ', 'EMAIL:e@x.de'])
    const mutated = fillMissingRegistrantData(vcard, {
      uid: 'gen-uid',
      firstName: 'New',
      lastName: 'Person',
    })
    expect(mutated).toBe(true)
    expect(vcard.getFirstPropertyValue('fn')).toBe('New Person')
  })
})

describe('findGrantableCalendars', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns the admin's own X-ADMIN-TAGS", async () => {
    mockFindUserByEmail.mockResolvedValue({
      user: { href: '/admin.vcf' },
      vcard: createMockVCard({ email: 'admin@example.com', adminTags: 'Chor,Vorstand' }),
    })
    await expect(findGrantableCalendars(DAV_CONFIG, 'admin@example.com')).resolves.toStrictEqual([
      'Chor',
      'Vorstand',
    ])
  })

  it('returns nothing when the admin administers no calendar', async () => {
    mockFindUserByEmail.mockResolvedValue({
      user: { href: '/admin.vcf' },
      vcard: createMockVCard({ email: 'admin@example.com' }),
    })
    await expect(findGrantableCalendars(DAV_CONFIG, 'admin@example.com')).resolves.toStrictEqual([])
  })

  it('throws when the admin has no DAV contact', async () => {
    mockFindUserByEmail.mockResolvedValue(false)
    await expect(findGrantableCalendars(DAV_CONFIG, 'ghost@example.com')).rejects.toThrow(
      'Admin account not found',
    )
  })
})

describe('narrowCalendarBinding', () => {
  const grantable = ['Chor', 'Vorstand']

  it('keeps the calendars the admin may hand out', () => {
    expect(narrowCalendarBinding(['Chor'], grantable)).toStrictEqual(['Chor'])
  })

  it('drops calendars the admin does not administer', () => {
    // A link must never grant access its creator cannot grant directly, so a
    // hand-crafted request naming a foreign calendar is silently narrowed.
    expect(narrowCalendarBinding(['Chor', 'Geheim'], grantable)).toStrictEqual(['Chor'])
  })

  it('collapses an entirely disallowed selection to no binding', () => {
    expect(narrowCalendarBinding(['Geheim'], grantable)).toBeNull()
  })

  it('treats an empty selection and an omitted one alike as no binding', () => {
    expect(narrowCalendarBinding([], grantable)).toBeNull()
    expect(narrowCalendarBinding(undefined, grantable)).toBeNull()
  })

  it('grants nothing when the admin administers no calendar', () => {
    expect(narrowCalendarBinding(['Chor'], [])).toBeNull()
  })
})
