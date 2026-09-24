// @vitest-environment node
import '../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { createMockVCard } from '../../test/fixtures/vcard-data'

import { applyTagChanges, tagStateFor } from './userTags'

const mockFindUserByEmail = vi.fn()
const mockFindCalendars = vi.fn()
const mockSaveUser = vi.fn()
const mockCreateUser = vi.fn()

// Only the DAV I/O is mocked; the pure vCard helpers (readAdminTags & co.) stay
// real, so these tests exercise the actual parsing rather than a copy of it.
vi.mock('./dav', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./dav')>()),
  createCardDAVAccount: () => ({ accountType: 'carddav' }),
  createCalDAVAccount: () => ({ accountType: 'caldav' }),
  findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
  findCalendars: (...args: unknown[]) => mockFindCalendars(...args),
  saveUser: (...args: unknown[]) => mockSaveUser(...args),
  createUser: (...args: unknown[]) => mockCreateUser(...args),
}))

const config = {
  DAV_USERNAME: 'u',
  DAV_PASSWORD: 'p',
  DAV_URL: 'https://dav.example.com',
  DAV_URL_CARD: 'https://dav.example.com/card',
}

const ADMIN = 'admin@example.de'
const TARGET = 'anna@example.de'

/** The admin's card, carrying the calendars they may hand out. */
function admin(tags = 'vorstand,jugend') {
  return { user: { href: '/admin.vcf' }, vcard: createMockVCard({ email: ADMIN, adminTags: tags }) }
}

function target(categories: string[] = []) {
  return {
    user: { href: '/anna.vcf' },
    vcard: createMockVCard({ email: TARGET, categories }),
  }
}

describe('tagStateFor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindCalendars.mockResolvedValue([])
  })

  it('refuses when the acting admin has no card of their own', async () => {
    mockFindUserByEmail.mockResolvedValueOnce(undefined)
    await expect(tagStateFor(config, ADMIN, TARGET)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('offers only what this admin administers', async () => {
    // An admin hands out what they hold themselves — otherwise one admin could
    // grant access to a calendar that is not theirs to grant.
    mockFindUserByEmail.mockResolvedValueOnce(admin('vorstand')).mockResolvedValueOnce(target())
    const tags = await tagStateFor(config, ADMIN, TARGET)
    expect(tags.map((tag) => tag.name)).toStrictEqual(['vorstand'])
  })

  it('marks what the member already has', async () => {
    mockFindUserByEmail.mockResolvedValueOnce(admin()).mockResolvedValueOnce(target(['vorstand']))
    const tags = await tagStateFor(config, ADMIN, TARGET)
    expect(tags).toStrictEqual([
      { name: 'vorstand', label: 'vorstand', state: true },
      { name: 'jugend', label: 'jugend', state: false },
    ])
  })

  it('puts the calendar’s real name next to the key', async () => {
    mockFindUserByEmail.mockResolvedValueOnce(admin('vorstand')).mockResolvedValueOnce(target())
    mockFindCalendars.mockResolvedValue([
      { url: 'https://dav.example.com/cal/vorstand/', displayName: 'Vorstand' },
    ])
    const tags = await tagStateFor(config, ADMIN, TARGET)
    expect(tags[0]).toMatchObject({ name: 'vorstand', label: 'Vorstand' })
  })

  it('falls back to the key for a calendar that no longer exists', async () => {
    // A dangling grant stays visible instead of rendering as a blank checkbox.
    mockFindUserByEmail.mockResolvedValueOnce(admin('gone')).mockResolvedValueOnce(target())
    mockFindCalendars.mockResolvedValue([])
    const tags = await tagStateFor(config, ADMIN, TARGET)
    expect(tags[0]).toMatchObject({ name: 'gone', label: 'gone' })
  })

  it('answers for somebody who has no card yet', async () => {
    mockFindUserByEmail.mockResolvedValueOnce(admin()).mockResolvedValueOnce(undefined)
    const tags = await tagStateFor(config, ADMIN, TARGET)
    expect(tags.every((tag) => !tag.state)).toBe(true)
  })
})

describe('applyTagChanges', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSaveUser.mockResolvedValue(undefined)
    mockCreateUser.mockResolvedValue(undefined)
  })

  it('refuses when the acting admin has no card of their own', async () => {
    mockFindUserByEmail.mockResolvedValueOnce(undefined)
    await expect(applyTagChanges(config, ADMIN, TARGET, [])).rejects.toMatchObject({
      statusCode: 403,
    })
  })

  it('does not fetch the calendar list to write', async () => {
    // Labels are only needed to show names; making every write wait on a second
    // DAV round trip would be a cost — and another way for it to fail.
    mockFindUserByEmail.mockResolvedValueOnce(admin()).mockResolvedValueOnce(target())
    await applyTagChanges(config, ADMIN, TARGET, [{ name: 'vorstand', state: true }])
    expect(mockFindCalendars).not.toHaveBeenCalled()
  })

  it('grants a calendar and reports it as newly granted', async () => {
    mockFindUserByEmail.mockResolvedValueOnce(admin()).mockResolvedValueOnce(target())
    const result = await applyTagChanges(config, ADMIN, TARGET, [{ name: 'vorstand', state: true }])
    expect(result).toStrictEqual({ newTags: ['vorstand'], created: false })
    expect(mockSaveUser).toHaveBeenCalledTimes(1)
  })

  it('reports a calendar the member already had as nothing new', async () => {
    // What decides whether a welcome mail goes out — telling somebody about a
    // calendar they have had for a year is noise.
    mockFindUserByEmail.mockResolvedValueOnce(admin()).mockResolvedValueOnce(target(['vorstand']))
    const result = await applyTagChanges(config, ADMIN, TARGET, [{ name: 'vorstand', state: true }])
    expect(result.newTags).toStrictEqual([])
  })

  it('takes a calendar away again', async () => {
    mockFindUserByEmail.mockResolvedValueOnce(admin()).mockResolvedValueOnce(target(['vorstand']))
    await applyTagChanges(config, ADMIN, TARGET, [{ name: 'vorstand', state: false }])
    const saved = mockSaveUser.mock.calls[0]![2] as { toString: () => string }
    expect(saved.toString()).not.toContain('vorstand')
  })

  it('ignores a calendar this admin does not administer', async () => {
    // A stale page may still carry a calendar the admin has since lost, and
    // that is not an error the member should feel.
    mockFindUserByEmail.mockResolvedValueOnce(admin('vorstand')).mockResolvedValueOnce(target())
    const result = await applyTagChanges(config, ADMIN, TARGET, [{ name: 'geheim', state: true }])
    expect(result.newTags).toStrictEqual([])
  })

  it('gives a card without a categories property one', async () => {
    mockFindUserByEmail.mockResolvedValueOnce(admin()).mockResolvedValueOnce({
      user: { href: '/anna.vcf' },
      vcard: createMockVCard({ email: TARGET }),
    })
    const result = await applyTagChanges(config, ADMIN, TARGET, [{ name: 'vorstand', state: true }])
    expect(result.newTags).toStrictEqual(['vorstand'])
  })

  it('creates a card for somebody DAV does not know yet', async () => {
    mockFindUserByEmail.mockResolvedValueOnce(admin()).mockResolvedValueOnce(undefined)
    const result = await applyTagChanges(config, ADMIN, TARGET, [
      { name: 'vorstand', state: true },
      { name: 'jugend', state: false },
    ])
    expect(result).toStrictEqual({ newTags: ['vorstand'], created: true })
    const created = mockCreateUser.mock.calls[0]![1] as { toString: () => string }
    // VERSION first, or ical.js re-reads the card under the vCard 3 design.
    expect(created.toString()).toContain('VERSION:4.0')
    expect(created.toString()).toContain('vorstand')
    expect(created.toString()).not.toContain('jugend')
  })
})
