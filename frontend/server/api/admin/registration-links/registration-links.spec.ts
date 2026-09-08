// @vitest-environment node
import '../../../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { createMockVCard } from '../../../../test/fixtures/vcard-data'
import { mockDb, queueDbResults, resetDb } from '../../../../test/helpers/mock-db'

import createHandler from './create.post'
import deleteHandler from './delete.post'
import listHandler from './list.get'
import reactivateHandler from './reactivate.post'
import revokeHandler from './revoke.post'
import updateHandler from './update.post'

vi.mock('~~/server/db', () => ({ useDb: () => mockDb }))

// The calendar binding is filtered against the creator's own X-ADMIN-TAGS,
// which means a DAV lookup. Only that I/O is mocked; readAdminTags stays real.
const mockFindUserByEmail = vi.fn()
vi.mock('~~/server/helpers/dav', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~~/server/helpers/dav')>()),
  createCardDAVAccount: () => ({ accountType: 'carddav' }),
  findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
}))

/** The admin's DAV contact, administering `Chor` and `Vorstand`. */
function adminAdministers(tags = 'Chor,Vorstand') {
  mockFindUserByEmail.mockResolvedValue({
    user: { href: '/admin.vcf' },
    vcard: createMockVCard({ email: 'admin@example.com', adminTags: tags }),
  })
}

const createFn = createHandler as unknown as (e: unknown) => Promise<Record<string, unknown>>
const listFn = listHandler as unknown as (e: unknown) => Promise<Record<string, unknown>[]>
const revokeFn = revokeHandler as unknown as (e: unknown) => Promise<unknown>
const updateFn = updateHandler as unknown as (e: unknown) => Promise<unknown>
const deleteFn = deleteHandler as unknown as (e: unknown) => Promise<unknown>
const reactivateFn = reactivateHandler as unknown as (e: unknown) => Promise<unknown>

function asAdmin() {
  vi.mocked(globalThis.requireUserSession).mockResolvedValue({
    user: { uid: 'admin-1', name: 'Admin', email: 'admin@example.com', role: 'admin' },
  })
}
function asUser() {
  vi.mocked(globalThis.requireUserSession).mockResolvedValue({
    user: { uid: 'u1', name: 'User', email: 'user@example.com', role: 'user' },
  })
}
function asOtherAdmin() {
  vi.mocked(globalThis.requireUserSession).mockResolvedValue({
    user: { uid: 'admin-2', name: 'Other', email: 'other@example.com', role: 'admin' },
  })
}
function body(value: Record<string, unknown>) {
  vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_e, v) =>
    (v as (d: unknown) => unknown)(value),
  )
}

describe('registration-links/create', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
  })

  it('rejects non-admins', async () => {
    asUser()
    await expect(createFn({})).rejects.toThrow('Not Authorized')
  })

  it('creates a link with label and maxUses', async () => {
    asAdmin()
    body({ label: 'Flyer', duration: '30d', maxUses: 10 })
    queueDbResults({})
    const res = await createFn({})
    expect(res.label).toBe('Flyer')
    expect(res.maxUses).toBe(10)
    expect(String(res.url)).toContain('/register/')
    expect(res.expiresAt).toBeInstanceOf(Date)
  })

  it('creates a link without label and unlimited (null) uses', async () => {
    asAdmin()
    body({ duration: 'unlimited' })
    queueDbResults({})
    const res = await createFn({})
    expect(res.label).toBeNull()
    expect(res.maxUses).toBeNull()
    expect(res.expiresAt).toBeNull()
  })

  it('binds the link to the selected calendars', async () => {
    asAdmin()
    adminAdministers()
    body({ duration: '30d', calendars: ['Chor'] })
    queueDbResults({})
    await expect(createFn({})).resolves.toMatchObject({ calendars: ['Chor'] })
  })

  it('drops calendars the creating admin does not administer', async () => {
    // Otherwise a hand-crafted request could hand out a foreign calendar.
    asAdmin()
    adminAdministers('Chor')
    body({ duration: '30d', calendars: ['Chor', 'Geheim'] })
    queueDbResults({})
    await expect(createFn({})).resolves.toMatchObject({ calendars: ['Chor'] })
  })

  it('stores no binding when nothing allowed remains', async () => {
    asAdmin()
    adminAdministers('Chor')
    body({ duration: '30d', calendars: ['Geheim'] })
    queueDbResults({})
    await expect(createFn({})).resolves.toMatchObject({ calendars: null })
  })

  it('skips the DAV lookup entirely when no calendars are requested', async () => {
    asAdmin()
    body({ duration: '30d', calendars: [] })
    queueDbResults({})
    await expect(createFn({})).resolves.toMatchObject({ calendars: null })
    expect(mockFindUserByEmail).not.toHaveBeenCalled()
  })
})

describe('registration-links/list', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
  })

  it('rejects non-admins', async () => {
    asUser()
    await expect(listFn({})).rejects.toThrow('Not Authorized')
  })

  it('maps links with their join counts and status', async () => {
    asAdmin()
    queueDbResults(
      [
        {
          token: 't1',
          label: 'L1',
          maxUses: 10,
          expiresAt: null,
          revokedAt: null,
          createdAt: new Date('2026-01-01'),
          createdByUid: 'a',
          createdByName: 'Admin',
          createdByEmail: 'a@x.de',
          calendars: ['Chor'],
        },
        {
          token: 't2',
          label: null,
          maxUses: null,
          expiresAt: null,
          revokedAt: new Date('2026-02-01'),
          createdAt: new Date('2026-01-02'),
          createdByUid: 'a',
          createdByName: 'Admin',
          createdByEmail: 'a@x.de',
          calendars: null,
        },
      ],
      [
        { linkToken: 't1', grantedCalendars: ['Chor'] },
        { linkToken: 't1', grantedCalendars: ['Chor'] },
      ],
    )
    const res = await listFn({})
    expect(res[0]).toMatchObject({
      token: 't1',
      useCount: 2,
      status: 'valid',
      calendars: ['Chor'],
      divergentUseCount: 0,
    })
    expect(res[1]).toMatchObject({ token: 't2', useCount: 0, status: 'revoked', calendars: null })
    expect(String(res[0]!.url)).toContain('/register/t1')
  })

  it('counts joins whose grant differs from the current binding', async () => {
    // The binding is editable, so past joins may have received something else.
    // Order within a grant must not matter; a join through the then-unbound link
    // (NULL) diverges from today's bound link.
    asAdmin()
    queueDbResults(
      [
        {
          token: 't1',
          label: 'L1',
          maxUses: null,
          expiresAt: null,
          revokedAt: null,
          createdAt: new Date('2026-01-01'),
          createdByUid: 'a',
          createdByName: 'Admin',
          createdByEmail: 'a@x.de',
          calendars: ['Chor', 'Vorstand'],
        },
      ],
      [
        { linkToken: 't1', grantedCalendars: ['Vorstand', 'Chor'] },
        { linkToken: 't1', grantedCalendars: null },
        { linkToken: 't1', grantedCalendars: ['Chor'] },
      ],
    )
    const res = await listFn({})
    expect(res[0]).toMatchObject({ useCount: 3, divergentUseCount: 2 })
  })
})

describe('registration-links/revoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
  })

  it('rejects non-admins', async () => {
    asUser()
    body({ token: 't1' })
    await expect(revokeFn({})).rejects.toThrow('Not Authorized')
  })

  it('revokes a link', async () => {
    asAdmin()
    body({ token: 't1' })
    queueDbResults({})
    await expect(revokeFn({})).resolves.toStrictEqual({})
  })
})

describe('registration-links/update', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
  })

  it('rejects non-admins', async () => {
    asUser()
    body({ token: 't1', label: 'X' })
    await expect(updateFn({})).rejects.toThrow('Not Authorized')
  })

  it('updates only the label when no duration is given', async () => {
    asAdmin()
    body({ token: 't1', label: 'Renamed' })
    queueDbResults([{ createdByUid: 'admin-1' }], {})
    await expect(updateFn({})).resolves.toStrictEqual({})
  })

  it('clears the label and re-bases validity when a duration is given', async () => {
    asAdmin()
    body({ token: 't1', label: '', duration: '7d' })
    queueDbResults([{ createdByUid: 'admin-1' }], {})
    await expect(updateFn({})).resolves.toStrictEqual({})
  })

  it('returns 404 when the link does not exist', async () => {
    asAdmin()
    body({ token: 't1', label: 'X' })
    queueDbResults([])
    await expect(updateFn({})).rejects.toThrow('Link not found')
  })

  it('rejects an admin who does not own the link', async () => {
    asOtherAdmin()
    body({ token: 't1', label: 'X' })
    queueDbResults([{ createdByUid: 'admin-1' }])
    await expect(updateFn({})).rejects.toThrow('Not Authorized')
  })

  it('changes the calendar binding of an existing link', async () => {
    // Editing stays allowed at any time: what past joins received is snapshotted
    // per redemption, so the binding only steers future ones.
    asAdmin()
    adminAdministers()
    body({ token: 't1', label: 'X', calendars: ['Vorstand'] })
    queueDbResults([{ createdByUid: 'admin-1' }], {})
    await expect(updateFn({})).resolves.toStrictEqual({})
  })

  it('clears the binding when an empty selection is sent', async () => {
    asAdmin()
    body({ token: 't1', label: 'X', calendars: [] })
    queueDbResults([{ createdByUid: 'admin-1' }], {})
    await expect(updateFn({})).resolves.toStrictEqual({})
    expect(mockFindUserByEmail).not.toHaveBeenCalled()
  })

  it('drops calendars the editing admin does not administer', async () => {
    asAdmin()
    adminAdministers('Chor')
    body({ token: 't1', label: 'X', calendars: ['Geheim'] })
    queueDbResults([{ createdByUid: 'admin-1' }], {})
    await expect(updateFn({})).resolves.toStrictEqual({})
  })
})

describe('registration-links/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
  })

  it('rejects non-admins', async () => {
    asUser()
    body({ token: 't1' })
    await expect(deleteFn({})).rejects.toThrow('Not Authorized')
  })

  it('returns 404 when the link does not exist', async () => {
    asAdmin()
    body({ token: 't1' })
    queueDbResults([])
    await expect(deleteFn({})).rejects.toThrow('Link not found')
  })

  it('rejects an admin who does not own the link', async () => {
    asOtherAdmin()
    body({ token: 't1' })
    queueDbResults([{ revokedAt: new Date(), createdByUid: 'admin-1' }])
    await expect(deleteFn({})).rejects.toThrow('Not Authorized')
  })

  it('refuses to delete a link that is still active', async () => {
    asAdmin()
    body({ token: 't1' })
    queueDbResults([{ revokedAt: null, createdByUid: 'admin-1' }])
    await expect(deleteFn({})).rejects.toThrow('Link is active')
  })

  it('refuses to delete a deactivated link that has redemptions', async () => {
    asAdmin()
    body({ token: 't1' })
    queueDbResults([{ revokedAt: new Date(), createdByUid: 'admin-1' }], [{ count: '2' }])
    await expect(deleteFn({})).rejects.toThrow('Link has redemptions')
  })

  it('deletes a deactivated link that was never redeemed', async () => {
    asAdmin()
    body({ token: 't1' })
    queueDbResults([{ revokedAt: new Date(), createdByUid: 'admin-1' }], [{ count: '0' }], {})
    await expect(deleteFn({})).resolves.toStrictEqual({})
  })

  it('treats a missing count row as zero and deletes', async () => {
    asAdmin()
    body({ token: 't1' })
    queueDbResults([{ revokedAt: new Date(), createdByUid: 'admin-1' }], [], {})
    await expect(deleteFn({})).resolves.toStrictEqual({})
  })
})

describe('registration-links/reactivate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
  })

  it('rejects non-admins', async () => {
    asUser()
    body({ token: 't1' })
    await expect(reactivateFn({})).rejects.toThrow('Not Authorized')
  })

  it('clears the revoked state', async () => {
    asAdmin()
    body({ token: 't1' })
    queueDbResults([{ createdByUid: 'admin-1' }], {})
    await expect(reactivateFn({})).resolves.toStrictEqual({})
  })

  it('returns 404 when the link does not exist', async () => {
    asAdmin()
    body({ token: 't1' })
    queueDbResults([])
    await expect(reactivateFn({})).rejects.toThrow('Link not found')
  })

  it('rejects an admin who does not own the link', async () => {
    asOtherAdmin()
    body({ token: 't1' })
    queueDbResults([{ createdByUid: 'admin-1' }])
    await expect(reactivateFn({})).rejects.toThrow('Not Authorized')
  })
})
