// @vitest-environment node
import '../../../test/setup-server'
import ICAL from 'ical.js'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { firstDbCall, mockDb, queueDbResults, resetDb } from '../../../test/helpers/mock-db'

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

const mockLoadPlzAreas = vi.fn()
vi.mock('../../helpers/memberMap', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadPlzAreas: () => mockLoadPlzAreas(),
}))

const GEOMETRY = {
  viewBox: '0 0 4000 5000',
  outline: 'M0 0l1 0z',
  areas: new Map([['64653', { o: 'Lorsch', d: 'M0 0l1 0z', c: [1, 2] as [number, number], s: 9 }]]),
}

const fn = handler as unknown as (e: unknown) => Promise<unknown>

function vcard(lines: string[]): ICAL.Component {
  return new ICAL.Component(
    ICAL.parse(['BEGIN:VCARD', 'VERSION:4.0', ...lines, 'END:VCARD'].join('\r\n')),
  )
}

/** Post the default profile with a different postal code. */
function sending(postalCode: string): void {
  vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_e, v) =>
    (v as (d: unknown) => unknown)({ firstName: 'Alicia', lastName: 'Wonder', postalCode }),
  )
}

/** A contact that is ready to be written to. */
function contactExists(card = vcard(['UID:u1', 'EMAIL:anna@example.com'])): ICAL.Component {
  mockFindUserByEmail.mockResolvedValue({ user: { href: '/a.vcf', props: {} }, vcard: card })
  queueDbResults({})
  return card
}

describe('profile.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'u1', name: 'Anna Mustermann', email: 'anna@example.com', role: 'user' },
    })
    mockLoadPlzAreas.mockResolvedValue(GEOMETRY)
    sending('64653')
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

  it('mirrors the postal code into the sidecar, where the map aggregates it', async () => {
    const card = vcard(['UID:u1', 'EMAIL:anna@example.com'])
    mockFindUserByEmail.mockResolvedValue({ user: { href: '/a.vcf', props: {} }, vcard: card })
    queueDbResults({})
    await fn({})
    expect(firstDbCall('set')).toStrictEqual([
      { displayName: 'Alicia Wonder', postalCode: '64653' },
    ])
  })

  it('clears the sidecar copy when the postal code is removed', async () => {
    // Null, not '': the map counts rows by postal code and an empty string
    // would be a group of its own.
    sending('')
    const card = contactExists(vcard(['UID:u1', 'EMAIL:anna@example.com', 'ADR:;;;;;64653;']))
    await fn({})
    expect(firstDbCall('set')).toStrictEqual([{ displayName: 'Alicia Wonder', postalCode: null }])
    expect(card.toString()).toContain('ADR:;;;;;;')
  })

  it('fills in a missing uid on legacy contacts', async () => {
    const card = contactExists(vcard(['EMAIL:anna@example.com']))
    await fn({})
    expect(card.getFirstPropertyValue('uid')).toBe('u1')
  })

  describe('postal-code validation', () => {
    // The map is the only consumer of this field, so the map's own geometry is
    // what decides — a format check passes five digits that place nobody.
    it.each([
      ['no area matches it', '99999'],
      ['it is too short', '646'],
      ['it is a house number', '12'],
      ['it is a foreign code', 'CH-8001'],
    ])('refuses a postal code because %s', async (_case, postalCode) => {
      sending(postalCode)
      contactExists()
      await expect(fn({})).rejects.toThrow('invalid-postal-code')
    })

    it('refuses before DAV is touched, so nothing is half written', async () => {
      sending('99999')
      contactExists()
      await expect(fn({})).rejects.toThrow('invalid-postal-code')
      expect(mockFindUserByEmail).not.toHaveBeenCalled()
      expect(mockSaveUser).not.toHaveBeenCalled()
    })

    it('stores the normalised five digits, not what was typed', async () => {
      // Otherwise "D-64653" and "64 653" are two spellings of one place, and
      // the aggregate has to unpick them on every request.
      sending(' D-64653 ')
      const card = contactExists()
      await expect(fn({})).resolves.toMatchObject({ postalCode: '64653' })
      expect(card.toString()).toContain('ADR:;;;;;64653;')
      expect(firstDbCall('set')).toStrictEqual([
        { displayName: 'Alicia Wonder', postalCode: '64653' },
      ])
    })

    it('falls back to the format when the artefact was never built', async () => {
      // A deployment without map data has no map; it must not also have an
      // unusable profile form — see docu/karte.md.
      mockLoadPlzAreas.mockResolvedValue(null)
      sending('99999')
      contactExists()
      await expect(fn({})).resolves.toMatchObject({ postalCode: '99999' })
    })

    it('still insists on five digits without the artefact', async () => {
      mockLoadPlzAreas.mockResolvedValue(null)
      sending('646')
      contactExists()
      await expect(fn({})).rejects.toThrow('invalid-postal-code')
    })
  })
})
