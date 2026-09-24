// @vitest-environment node
import '../../../../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { firstDbCall, mockDb, queueDbResults, resetDb } from '../../../../../test/helpers/mock-db'

import handler from './sessions.post'

vi.mock('~~/server/db', () => ({ useDb: () => mockDb }))

const mockRecordEvent = vi.fn()
vi.mock('~~/server/helpers/events', () => ({
  recordEvent: (...a: unknown[]) => mockRecordEvent(...a),
}))

const fn = handler as unknown as (e: unknown) => Promise<{ revokedSessions: number }>

describe('admin/members/[uid]/sessions.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'a1', email: 'admin@example.de', name: 'Admin', role: 'admin' },
    })
    vi.mocked(globalThis.getRouterParam).mockReturnValue('u1')
  })

  it('refuses anybody who is not an admin', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({ user: { uid: 'u1', role: 'user' } })
    await expect(fn({})).rejects.toMatchObject({ statusCode: 403 })
  })

  it('refuses a request without a uid', async () => {
    vi.mocked(globalThis.getRouterParam).mockReturnValue(undefined)
    await expect(fn({})).rejects.toMatchObject({ statusCode: 400 })
  })

  it('answers 404 for a uid nobody has', async () => {
    queueDbResults([])
    await expect(fn({})).rejects.toMatchObject({ statusCode: 404 })
  })

  it('revokes rather than deletes', async () => {
    // `revokedAt` is what the session-check middleware reads, and the row
    // staying behind is what lets the chronicle show that somebody ended it.
    queueDbResults([{ uid: 'u1' }], [{ affectedRows: 2 }])
    await expect(fn({})).resolves.toStrictEqual({ revokedSessions: 2 })
    expect(firstDbCall('set')?.[0]).toMatchObject({ revokedAt: expect.any(Date) })
  })

  it('is honest about a member who had nothing open', async () => {
    queueDbResults([{ uid: 'u1' }], [{ affectedRows: 0 }])
    await expect(fn({})).resolves.toStrictEqual({ revokedSessions: 0 })
  })

  it('records who ended them, and how many', async () => {
    queueDbResults([{ uid: 'u1' }], [{ affectedRows: 2 }])
    await fn({ path: '/api/admin/members/u1/sessions' })
    expect(mockRecordEvent).toHaveBeenCalledWith({
      type: 'admin.sessions_revoked',
      userUid: 'u1',
      actorUid: 'a1',
      meta: { revokedSessions: 2 },
      event: { path: '/api/admin/members/u1/sessions' },
    })
  })
})
