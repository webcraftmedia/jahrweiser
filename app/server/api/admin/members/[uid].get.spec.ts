// @vitest-environment node
import '../../../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { mockDb, queueDbResults, resetDb } from '../../../../test/helpers/mock-db'

import handler from './[uid].get'

vi.mock('~~/server/db', () => ({ useDb: () => mockDb }))

const fn = handler as unknown as (e: unknown) => Promise<{
  name: string
  email: string
  status: string
  sessions: { id: string; active: boolean }[]
}>

const NOW = Date.UTC(2026, 8, 24, 12, 0, 0)

const user = {
  uid: 'u1',
  displayName: 'Anna Mustermann',
  email: 'anna.mustermann@example.de',
  role: 'user',
  loginDisabled: false,
  deletedAt: null,
  newsletterSubscribed: 'subscribed',
  postalCode: '64625',
  createdAt: new Date(NOW - 1000),
}

function session(over: Record<string, unknown> = {}) {
  return {
    id: 'abcdef0123456789',
    createdAt: new Date(NOW - 5000),
    expiresAt: new Date(NOW + 5000),
    lastSeenAt: new Date(NOW - 100),
    revokedAt: null,
    ...over,
  }
}

describe('admin/members/[uid].get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'a1', email: 'admin@example.de', name: 'Admin', role: 'admin' },
    })
    vi.mocked(globalThis.getRouterParam).mockReturnValue('u1')
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

  it('keeps the address masked even on the detail page', async () => {
    // Opening somebody's page is not a reason to hand out their address —
    // that takes the recorded step in reveal.post.ts.
    queueDbResults([user], [])
    const result = await fn({})
    expect(result).toMatchObject({ name: 'Anna M.', email: 'an•••@ex•••.de' })
    expect(JSON.stringify(result)).not.toContain('anna.mustermann')
  })

  it('shows which sessions would still let somebody in', async () => {
    queueDbResults(
      [user],
      [
        session(),
        session({ id: 'expired000000000', expiresAt: new Date(NOW - 1) }),
        session({ id: 'revoked000000000', revokedAt: new Date(NOW - 10) }),
      ],
    )
    const result = await fn({})
    expect(result.sessions.map((s) => s.active)).toStrictEqual([true, false, false])
  })

  it('names each session, because ending one means naming it', async () => {
    // Not a credential: the cookie carrying it is sealed with a server secret,
    // so knowing the id gets nobody in. The page shows only its first
    // characters.
    queueDbResults([user], [session()])
    const result = await fn({})
    expect(result.sessions[0]!.id).toBe('abcdef0123456789')
  })

  it.each([
    [{ deletedAt: null, loginDisabled: false }, 'active'],
    [{ deletedAt: null, loginDisabled: true }, 'blocked'],
    [{ deletedAt: new Date(NOW), loginDisabled: false }, 'deleted'],
  ])('says in one word what %o is', async (over, status) => {
    queueDbResults([{ ...user, ...over }], [])
    await expect(fn({})).resolves.toMatchObject({ status })
  })

  it('carries a member who never logged in without inventing dates', async () => {
    queueDbResults([user], [session({ lastSeenAt: null })])
    const result = await fn({})
    expect(result.sessions[0]).toMatchObject({ lastSeenAt: null, revokedAt: null })
  })
})
