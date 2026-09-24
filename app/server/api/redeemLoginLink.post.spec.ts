// @vitest-environment node
import '../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { mockDb, queueDbResults, resetDb } from '../../test/helpers/mock-db'

import handler from './redeemLoginLink.post'

vi.mock('../db', () => ({ useDb: () => mockDb }))

const mockRecordEvent = vi.fn()
vi.mock('../helpers/events', () => ({
  recordEvent: (...a: unknown[]) => mockRecordEvent(...a),
}))

const fn = handler as unknown as (e: unknown) => Promise<unknown>

const future = new Date(Date.now() + 60_000)
const past = new Date(Date.now() - 60_000)

describe('redeemLoginLink.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_e, v) =>
      (v as (d: unknown) => unknown)({ token: 'tok' }),
    )
  })

  // Every rejection is a 401 with the same message; the `reason` is what the
  // login page turns into a sentence somebody can act on. Asserting it here is
  // the point — collapsing all four into one message is how a mail scanner ate
  // a member's links for three months without anyone being able to tell.
  it('rejects an unknown token', async () => {
    queueDbResults([])
    await expect(fn({})).rejects.toThrow('Bad credentials')
    queueDbResults([])
    await expect(fn({})).rejects.toMatchObject({ data: { reason: 'unknown' } })
  })

  // The trail is the reason this endpoint can be diagnosed at all: from the
  // member's side "already used" and "expired" are the same shrug, and the
  // difference decides whether they need a new link or a word with the Obmann.
  it.each([
    ['unknown', 'auth.redeem_unknown', undefined],
    ['used', 'auth.redeem_used', 'u1'],
    ['expired', 'auth.redeem_expired', 'u1'],
  ] as const)('records a refusal for %s', async (reason, type, userUid) => {
    const rows: Record<string, unknown[]> = {
      unknown: [],
      used: [{ token: 'tok', userUid: 'u1', expiresAt: future, consumedAt: new Date() }],
      expired: [{ token: 'tok', userUid: 'u1', expiresAt: past, consumedAt: null }],
    }
    queueDbResults(rows[reason])
    await expect(fn({ path: '/api/redeemLoginLink' })).rejects.toThrow('Bad credentials')
    expect(mockRecordEvent).toHaveBeenCalledWith({
      type,
      userUid,
      event: { path: '/api/redeemLoginLink' },
    })
  })

  it('records a refusal for a blocked account against that account', async () => {
    queueDbResults(
      [{ token: 'tok', userUid: 'u1', expiresAt: future, consumedAt: null }],
      [{ uid: 'u1', deletedAt: null, loginDisabled: true }],
    )
    await expect(fn({})).rejects.toThrow('Bad credentials')
    expect(mockRecordEvent).toHaveBeenCalledWith({
      type: 'auth.redeem_disabled',
      userUid: 'u1',
      event: {},
    })
  })

  it('rejects a token that was already redeemed', async () => {
    // Selected despite `consumed_at` being set, so this stays distinguishable
    // from a token that never existed.
    queueDbResults([{ token: 'tok', userUid: 'u1', expiresAt: future, consumedAt: new Date() }])
    await expect(fn({})).rejects.toMatchObject({ data: { reason: 'used' } })
  })

  it('rejects an expired token', async () => {
    queueDbResults([{ token: 'tok', userUid: 'u1', expiresAt: past, consumedAt: null }])
    await expect(fn({})).rejects.toMatchObject({ data: { reason: 'expired' } })
  })

  it('rejects when the token has no matching user', async () => {
    queueDbResults(
      [{ token: 'tok', userUid: 'u1', expiresAt: future, consumedAt: null }],
      [], // user lookup empty
    )
    await expect(fn({})).rejects.toMatchObject({ data: { reason: 'disabled' } })
  })

  it('rejects when the user is soft-deleted', async () => {
    queueDbResults(
      [{ token: 'tok', userUid: 'u1', expiresAt: future, consumedAt: null }],
      [{ uid: 'u1', deletedAt: new Date(), loginDisabled: false }],
    )
    await expect(fn({})).rejects.toMatchObject({ data: { reason: 'disabled' } })
  })

  it('rejects when the user is login-disabled', async () => {
    queueDbResults(
      [{ token: 'tok', userUid: 'u1', expiresAt: future, consumedAt: null }],
      [{ uid: 'u1', deletedAt: null, loginDisabled: true }],
    )
    await expect(fn({})).rejects.toMatchObject({ data: { reason: 'disabled' } })
  })

  it('throws 500 when no session id is established', async () => {
    queueDbResults(
      [{ token: 'tok', userUid: 'u1', expiresAt: future, consumedAt: null }],
      [
        {
          uid: 'u1',
          displayName: 'A',
          email: 'a@x.de',
          role: 'user',
          deletedAt: null,
          loginDisabled: false,
        },
      ],
      {}, // consume update
    )
    vi.mocked(globalThis.getUserSession).mockResolvedValue({})
    await expect(fn({})).rejects.toThrow('Failed to establish session id')
  })

  it('establishes a session on success', async () => {
    queueDbResults(
      [{ token: 'tok', userUid: 'u1', expiresAt: future, consumedAt: null }],
      [
        {
          uid: 'u1',
          displayName: 'A',
          email: 'a@x.de',
          role: 'user',
          deletedAt: null,
          loginDisabled: false,
        },
      ],
      {}, // consume update
      {}, // session insert
    )
    vi.mocked(globalThis.getUserSession).mockResolvedValue({ id: 'sess-1' })
    await expect(fn({})).resolves.toStrictEqual({})
  })

  it('records the success only once the session row exists', async () => {
    // Written last on purpose: "ok" in the trail has to mean the session was
    // really established, so that a failure reported after it points at the
    // browser rather than at us.
    queueDbResults(
      [{ token: 'tok', userUid: 'u1', expiresAt: future, consumedAt: null }],
      [
        {
          uid: 'u1',
          displayName: 'A',
          email: 'a@x.de',
          role: 'user',
          deletedAt: null,
          loginDisabled: false,
        },
      ],
      {},
      {},
    )
    vi.mocked(globalThis.getUserSession).mockResolvedValue({ id: 'sess-1' })
    await fn({})
    expect(mockRecordEvent).toHaveBeenCalledWith({
      type: 'auth.redeem_ok',
      userUid: 'u1',
      event: {},
    })
  })

  it('records nothing when the session id could not be established', async () => {
    queueDbResults(
      [{ token: 'tok', userUid: 'u1', expiresAt: future, consumedAt: null }],
      [
        {
          uid: 'u1',
          displayName: 'A',
          email: 'a@x.de',
          role: 'user',
          deletedAt: null,
          loginDisabled: false,
        },
      ],
      {},
    )
    vi.mocked(globalThis.getUserSession).mockResolvedValue({})
    await expect(fn({})).rejects.toThrow('Failed to establish session id')
    expect(mockRecordEvent).not.toHaveBeenCalled()
  })
})
