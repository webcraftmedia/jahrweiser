// @vitest-environment node
import '../../../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { mockDb, queueDbResults, resetDb } from '../../../../test/helpers/mock-db'

import createHandler from './create.post'
import deleteHandler from './delete.post'
import listHandler from './list.get'
import reactivateHandler from './reactivate.post'
import revokeHandler from './revoke.post'
import updateHandler from './update.post'

vi.mock('~~/server/db', () => ({ useDb: () => mockDb }))

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
        },
      ],
      [{ linkToken: 't1', count: '2' }],
    )
    const res = await listFn({})
    expect(res[0]).toMatchObject({ token: 't1', useCount: 2, status: 'valid' })
    expect(res[1]).toMatchObject({ token: 't2', useCount: 0, status: 'revoked' })
    expect(String(res[0]!.url)).toContain('/register/t1')
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
    queueDbResults({})
    await expect(updateFn({})).resolves.toStrictEqual({})
  })

  it('clears the label and re-bases validity when a duration is given', async () => {
    asAdmin()
    body({ token: 't1', label: '', duration: '7d' })
    queueDbResults({})
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

  it('refuses to delete a link that is still active', async () => {
    asAdmin()
    body({ token: 't1' })
    queueDbResults([{ revokedAt: null }])
    await expect(deleteFn({})).rejects.toThrow('Link is active')
  })

  it('refuses to delete a deactivated link that has redemptions', async () => {
    asAdmin()
    body({ token: 't1' })
    queueDbResults([{ revokedAt: new Date() }], [{ count: '2' }])
    await expect(deleteFn({})).rejects.toThrow('Link has redemptions')
  })

  it('deletes a deactivated link that was never redeemed', async () => {
    asAdmin()
    body({ token: 't1' })
    queueDbResults([{ revokedAt: new Date() }], [{ count: '0' }], {})
    await expect(deleteFn({})).resolves.toStrictEqual({})
  })

  it('treats a missing count row as zero and deletes', async () => {
    asAdmin()
    body({ token: 't1' })
    queueDbResults([{ revokedAt: new Date() }], [], {})
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
    queueDbResults({})
    await expect(reactivateFn({})).resolves.toStrictEqual({})
  })
})
