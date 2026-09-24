// @vitest-environment node
import '../../../../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  dbCalls,
  firstDbCall,
  mockDb,
  queueDbResults,
  resetDb,
} from '../../../../../test/helpers/mock-db'

import handler from './sessions.post'

vi.mock('~~/server/db', () => ({ useDb: () => mockDb }))

const mockRecordEvent = vi.fn()
vi.mock('~~/server/helpers/events', () => ({
  recordEvent: (...a: unknown[]) => mockRecordEvent(...a),
}))

const fn = handler as unknown as (e: unknown) => Promise<{ revokedSessions: number }>

describe('admin/members/[uid]/sessions.post', () => {
  /** The body the detail page sends: nothing, or one session id. */
  function sending(body: { sessionId?: string }) {
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_e, v) =>
      (v as (d: unknown) => unknown)(body),
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'a1', email: 'admin@example.de', name: 'Admin', role: 'admin' },
    })
    vi.mocked(globalThis.getRouterParam).mockReturnValue('u1')
    sending({})
  })

  it('refuses anybody who is not an admin', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'u1', role: 'user' },
    })
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
      meta: { revokedSessions: 2, scope: 'all' },
      event: { path: '/api/admin/members/u1/sessions' },
    })
  })

  it('ends a single named session', async () => {
    // The ordinary case: one forgotten device, while the member stays signed in
    // on the one they are holding.
    sending({ sessionId: 'sess-1' })
    queueDbResults([{ uid: 'u1' }], [{ affectedRows: 1 }])
    await expect(fn({})).resolves.toStrictEqual({ revokedSessions: 1 })
    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ meta: { revokedSessions: 1, scope: 'one' } }),
    )
  })

  it('scopes a named session to its member', async () => {
    // A session id from one member's page must never be able to end somebody
    // else's session, so the member stays part of the condition either way.
    sending({ sessionId: 'sess-1' })
    queueDbResults([{ uid: 'u1' }], [{ affectedRows: 0 }])
    await fn({})
    const wheres = dbCalls().filter((c) => c.method === 'where')
    expect(wheres).toHaveLength(2)
  })

  it('refuses an empty session id rather than treating it as "all"', async () => {
    sending({ sessionId: '' })
    await expect(fn({})).rejects.toThrow(/too_small|at least/i)
  })
})
