// @vitest-environment node
import '../../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { mockDb, queueDbResults, resetDb } from '../../../test/helpers/mock-db'

import handler from './newsletter.get'

vi.mock('../../db', () => ({ useDb: () => mockDb }))

const fn = handler as unknown as (e: unknown) => Promise<{ subscribed: boolean }>

describe('me/newsletter.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'u1', name: 'A', email: 'a@x.de', role: 'user' },
    })
  })

  it('rejects when the session has no uid', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({ user: { email: 'a@x.de' } })
    await expect(fn({})).rejects.toThrow('No user context')
  })

  it('returns 404 when the user is not in the sidecar', async () => {
    queueDbResults([])
    await expect(fn({})).rejects.toThrow('User not found')
  })

  it('reports the subscription state', async () => {
    queueDbResults([{ newsletterSubscribed: 'subscribed' }])
    await expect(fn({})).resolves.toStrictEqual({ subscribed: true })
  })
})
