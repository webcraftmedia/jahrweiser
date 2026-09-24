// @vitest-environment node
import '../../../../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { firstDbCall, mockDb, queueDbResults, resetDb } from '../../../../../test/helpers/mock-db'

import handler from './newsletter.post'

vi.mock('~~/server/db', () => ({ useDb: () => mockDb }))

const mockRecordEvent = vi.fn()
vi.mock('~~/server/helpers/events', () => ({
  recordEvent: (...a: unknown[]) => mockRecordEvent(...a),
}))

const fn = handler as unknown as (e: unknown) => Promise<{ subscribed: boolean }>

function sending(subscribed: boolean) {
  vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_e, v) =>
    (v as (d: unknown) => unknown)({ subscribed }),
  )
}

describe('admin/members/[uid]/newsletter.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'a1', email: 'admin@example.de', name: 'Admin', role: 'admin' },
    })
    vi.mocked(globalThis.getRouterParam).mockReturnValue('u1')
    sending(false)
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

  it('unsubscribes on request', async () => {
    queueDbResults([{ uid: 'u1', unsubscribeToken: 'tok' }], {})
    await expect(fn({})).resolves.toStrictEqual({ subscribed: false })
    expect(firstDbCall('set')?.[0]).toMatchObject({
      newsletterSubscribed: 'unsubscribed',
      unsubscribeToken: 'tok',
    })
  })

  it('mints a token for somebody who never had one', async () => {
    // Every mail needs one in its List-Unsubscribe header, and a member
    // switched on by an admin is no different from one who did it themselves.
    sending(true)
    queueDbResults([{ uid: 'u1', unsubscribeToken: null }], {})
    await fn({})
    const set = firstDbCall('set')?.[0] as { unsubscribeToken: string }
    expect(set.unsubscribeToken).toMatch(/^[0-9a-f]{64}$/)
  })

  it('records it as the admin’s doing, not the member’s', async () => {
    // The chronicle must not make somebody else's decision look like theirs.
    queueDbResults([{ uid: 'u1', unsubscribeToken: 'tok' }], {})
    await fn({ path: '/api/admin/members/u1/newsletter' })
    expect(mockRecordEvent).toHaveBeenCalledWith({
      type: 'admin.newsletter_changed',
      userUid: 'u1',
      actorUid: 'a1',
      meta: { subscribed: false },
      event: { path: '/api/admin/members/u1/newsletter' },
    })
  })

  it('refuses a body that does not say what to do', async () => {
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_e, v) =>
      (v as (d: unknown) => unknown)({}),
    )
    await expect(fn({})).rejects.toThrow(/invalid|expected|received/i)
  })
})
