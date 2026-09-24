// @vitest-environment node
import '../../../../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { firstDbCall, mockDb, queueDbResults, resetDb } from '../../../../../test/helpers/mock-db'

import handler from './block.post'

vi.mock('~~/server/db', () => ({ useDb: () => mockDb }))

const mockRecordEvent = vi.fn()
vi.mock('~~/server/helpers/events', () => ({
  recordEvent: (...a: unknown[]) => mockRecordEvent(...a),
}))

const fn = handler as unknown as (e: unknown) => Promise<{
  blocked: boolean
  revokedSessions: number
}>

/** The body the admin page sends. */
function sending(body: { blocked: boolean; reason?: string }) {
  vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_e, v) =>
    (v as (d: unknown) => unknown)(body),
  )
}

describe('admin/members/[uid]/block.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'a1', email: 'admin@example.de', name: 'Admin', role: 'admin' },
    })
    vi.mocked(globalThis.getRouterParam).mockReturnValue('u1')
    sending({ blocked: true })
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

  it('refuses to let an admin block themselves', async () => {
    // They would lock themselves out of the page they are standing on — and
    // possibly be the last admin in the app.
    vi.mocked(globalThis.getRouterParam).mockReturnValue('a1')
    queueDbResults([{ uid: 'a1' }])
    await expect(fn({})).rejects.toMatchObject({ statusCode: 400 })
  })

  it('lets an admin unblock themselves', async () => {
    vi.mocked(globalThis.getRouterParam).mockReturnValue('a1')
    sending({ blocked: false })
    queueDbResults([{ uid: 'a1' }], {})
    await expect(fn({})).resolves.toMatchObject({ blocked: false })
  })

  // The half that is easy to forget: without it a blocked member stays signed
  // in wherever they already are, for as long as the idle window lasts.
  it('ends every session when it blocks', async () => {
    queueDbResults([{ uid: 'u1' }], {}, [{ affectedRows: 3 }])
    await expect(fn({})).resolves.toStrictEqual({ blocked: true, revokedSessions: 3 })
    expect(firstDbCall('set')).toStrictEqual([{ loginDisabled: true }])
  })

  it('does not hand the sessions back when it unblocks', async () => {
    // They were ended; the way back in is the front door.
    sending({ blocked: false })
    queueDbResults([{ uid: 'u1' }], {})
    await expect(fn({})).resolves.toStrictEqual({ blocked: false, revokedSessions: 0 })
    expect(firstDbCall('set')).toStrictEqual([{ loginDisabled: false }])
  })

  it('records the block against both the member and the admin', async () => {
    queueDbResults([{ uid: 'u1' }], {}, [{ affectedRows: 2 }])
    await fn({ path: '/api/admin/members/u1/block' })
    expect(mockRecordEvent).toHaveBeenCalledWith({
      type: 'admin.blocked',
      userUid: 'u1',
      actorUid: 'a1',
      meta: { revokedSessions: 2 },
      event: { path: '/api/admin/members/u1/block' },
    })
  })

  it('keeps the reason in the chronicle when one was given', async () => {
    sending({ blocked: true, reason: 'Auf eigenen Wunsch' })
    queueDbResults([{ uid: 'u1' }], {}, [{ affectedRows: 0 }])
    await fn({})
    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ meta: { reason: 'Auf eigenen Wunsch', revokedSessions: 0 } }),
    )
  })

  it('records an unblock as an unblock', async () => {
    sending({ blocked: false })
    queueDbResults([{ uid: 'u1' }], {})
    await fn({})
    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'admin.unblocked', meta: {} }),
    )
  })

  it('refuses a body that does not say what to do', async () => {
    sending({} as { blocked: boolean })
    await expect(fn({})).rejects.toThrow()
  })
})
