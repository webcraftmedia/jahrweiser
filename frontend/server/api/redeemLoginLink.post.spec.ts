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

  it('rejects an unknown token', async () => {
    queueDbResults([])
    await expect(fn({})).rejects.toThrow('Bad credentials')
  })

  it('rejects an expired token', async () => {
    queueDbResults([{ token: 'tok', userUid: 'u1', expiresAt: past, consumedAt: null }])
    await expect(fn({})).rejects.toThrow('Bad credentials')
  })

  it('rejects when the token has no matching user', async () => {
    queueDbResults(
      [{ token: 'tok', userUid: 'u1', expiresAt: future, consumedAt: null }],
      [], // user lookup empty
    )
    await expect(fn({})).rejects.toThrow('Bad credentials')
  })

  it('rejects when the user is soft-deleted', async () => {
    queueDbResults(
      [{ token: 'tok', userUid: 'u1', expiresAt: future, consumedAt: null }],
      [{ uid: 'u1', deletedAt: new Date(), loginDisabled: false }],
    )
    await expect(fn({})).rejects.toThrow('Bad credentials')
  })

  it('rejects when the user is login-disabled', async () => {
    queueDbResults(
      [{ token: 'tok', userUid: 'u1', expiresAt: future, consumedAt: null }],
      [{ uid: 'u1', deletedAt: null, loginDisabled: true }],
    )
    await expect(fn({})).rejects.toThrow('Bad credentials')
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
