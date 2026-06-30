// @vitest-environment node
import '../../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { mockDb, queueDbResults, resetDb } from '../../../test/helpers/mock-db'

import handler from './newsletter.post'

vi.mock('../../db', () => ({ useDb: () => mockDb }))

const fn = handler as unknown as (e: unknown) => Promise<{ subscribed: boolean }>

describe('me/newsletter.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'u1', name: 'A', email: 'a@x.de', role: 'user' },
    })
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_e, v) =>
      (v as (d: unknown) => unknown)({ subscribed: true }),
    )
  })

  it('rejects when the session has no uid', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({ user: { email: 'a@x.de' } })
    await expect(fn({})).rejects.toThrow('No user context')
  })

  it('returns 404 when the user is not in the sidecar', async () => {
    queueDbResults([])
    await expect(fn({})).rejects.toThrow('User not found')
  })

  it('reuses an existing unsubscribe token', async () => {
    queueDbResults([{ unsubscribeToken: 'existing-token' }], {})
    await expect(fn({})).resolves.toStrictEqual({ subscribed: true })
  })

  it('lazily generates an unsubscribe token on first subscribe', async () => {
    queueDbResults([{ unsubscribeToken: null }], {})
    await expect(fn({})).resolves.toStrictEqual({ subscribed: true })
  })

  it('unsubscribes when subscribed is false', async () => {
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_e, v) =>
      (v as (d: unknown) => unknown)({ subscribed: false }),
    )
    queueDbResults([{ unsubscribeToken: 'existing-token' }], {})
    await expect(fn({})).resolves.toStrictEqual({ subscribed: false })
  })
})
