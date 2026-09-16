// @vitest-environment node
import '../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { mockDb, queueDbResults, resetDb } from '../../test/helpers/mock-db'

import handler from './redeemLoginLink.post'

vi.mock('../db', () => ({ useDb: () => mockDb }))

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
})
